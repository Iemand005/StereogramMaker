const vertShader = `
attribute vec3 position;
varying vec2 vUv;

void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 1.0);
}
`;

const fragShader = `
precision highp float;
uniform vec2 iResolution;
uniform sampler2D pattern;
uniform sampler2D depthBuffer;
varying vec2 vUv;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    float numTiles = 6.0;
    float maxDepthShift = 25.0; 
    float tileWidth = iResolution.x / numTiles;
    
    float x = gl_FragCoord.x;
    float y = gl_FragCoord.y;

    // 1. The Stereogram Chain
    for (int i = 0; i < 30; i++) {
        if (x < tileWidth) break;
        
        // Sample depth at the current tracing point
        float d = texture2D(depthBuffer, vec2(x, y) / iResolution.xy).r;
        
        // The jump
        x -= (tileWidth - d * maxDepthShift);
    }
    
    // 2. Normalize x to the [0, 1] range of the first tile
    float relativeX = x / tileWidth;
    vec2 patternUV = vec2(relativeX, y / iResolution.y);

    // 3. Create the "Noisy Anchor Bar"
    // We use a fixed seed based on 'y' and a tiny 'x' range 
    // so the noise is identical in every repetition's anchor.
    bool isAnchorZone = relativeX < 0.05; 
    float anchorNoise = random(vec2(0.5, floor(y))); // floor(y) makes it blocky noise

    if (isAnchorZone && false) {
        // Black background with noisy white pixels as anchors
        float brightness = (anchorNoise > 0.8) ? 1.0 : 0.0;
        gl_FragColor = vec4(vec3(brightness), 1.0);
    } else {
        // Normal pattern
        gl_FragColor = texture2D(pattern, patternUV);
    }
}
`;

function init() {
    const canvas = document.getElementById('autostereogram');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const patternImage = document.getElementById("pattern-image");
    const depthImage = document.getElementById("depth-image");

    /**
     * @param {number} type 
     * @param {string} shaderSource 
     */
    function createShader(type, shaderSource) {
        if (!gl) throw new Error("No GL");

        const s = gl.createShader(type);
        if (!s) throw new Error("No shader");
        gl.shaderSource(s, shaderSource);
        gl.compileShader(s);

        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(s);
            console.error(msg);
            alert("Shader Error: " + msg);
            throw new Error(msg || "Unknown error");
        }

        return s;
    }

    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertShader));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragShader));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, "iResolution");
    gl.uniform2f(resLoc, canvas.width, canvas.height);

    /**
     * @param {HTMLImageElement} img 
     * @param {number} index 
     */
    function loadTexture(img, index) {
        if (!gl) return;
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        img.onload = function() {
            gl.activeTexture(gl.TEXTURE0 + index);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            draw();
        };
        
        return tex;
    }

    gl.uniform1i(gl.getUniformLocation(program, "pattern"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "depthBuffer"), 1);

    if (!(patternImage instanceof HTMLImageElement && depthImage instanceof HTMLImageElement)) return;
    loadTexture(patternImage, 0);
    loadTexture(depthImage, 1);

    function draw() {
        if (!gl) return;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

}

init();



const canvas = document.getElementById("canvas");
if (canvas instanceof HTMLCanvasElement) {
    const vsSource =
    "attribute vec4 aVertexPosition; attribute vec4 aVertexColor; uniform mat4 uModelViewMatrix; uniform mat4 uProjectionMatrix; varying lowp vec4 vColor; void main() { gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition; vColor = aVertexColor; }";
    const fsSourceColour =
    "varying lowp vec4 vColor; void main() { gl_FragColor = vColor; }";
    const fsSource = `
    precision lowp float;
    void main() {
        float depth = 1.0 - gl_FragCoord.z;
        gl_FragColor = vec4(vec3(depth), 1.0);
    }
`;

    const graphics = new Graphics3D(canvas);
    const gl = graphics.gl;
    graphics.clear();
    graphics.loadShaders(vsSource, fsSource);

    const programInfo = {
    program: graphics.shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(
        graphics.shaderProgram,
        "aVertexPosition"
        ),
        vertexColor: gl.getAttribLocation(graphics.shaderProgram, "aVertexColor")
    },
    uniformLocations: {
        projectionMatrix: gl.getUniformLocation(
        graphics.shaderProgram,
        "uProjectionMatrix"
        ),
        modelViewMatrix: gl.getUniformLocation(
        graphics.shaderProgram,
        "uModelViewMatrix"
        )
    }
    };

    const positionBuffer = gl.createBuffer();

    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Now create an array of positions for the square.
    // const positions = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0];y

    const positions = [
    // Front face
    -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,

    // Back face
    -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,

    // Top face
    -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0,

    // Bottom face
    -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,

    // Right face
    1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0,

    // Left face
    -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0
    ];

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // This array defines each face as two triangles, using the
    // indices into the vertex array to specify each triangle's
    // position.

    // prettier-ignore
    const indices = [
    0, 1, 2, 0, 2, 3,    // front
    4, 5, 6, 4, 6, 7,    // back
    8, 9, 10, 8, 10, 11,   // top
    12, 13, 14, 12, 14, 15,   // bottom
    16, 17, 18, 16, 18, 19,   // right
    20, 21, 22, 20, 22, 23   // left
    ];

    const faceColors = [
    [1.0, 1.0, 1.0, 1.0], // Front face: white
    [1.0, 0.0, 0.0, 1.0], // Back face: red
    [0.0, 1.0, 0.0, 1.0], // Top face: green
    [0.0, 0.0, 1.0, 1.0], // Bottom face: blue
    [1.0, 1.0, 0.0, 1.0], // Right face: yellow
    [1.0, 0.0, 1.0, 1.0] // Left face: purple
    ];

    // Convert the array of colors into a table for all the vertices.

    let colors = [];

    for (let cIndex in faceColors) {
    // Repeat each color four times for the four vertices of the face
    const c = faceColors[cIndex];
    colors = colors.concat(c, c, c, c);
    }

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    const buffers = {
    position: positionBuffer,
    indices: indexBuffer,
    color: colorBuffer
    };

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
    );

    graphics.buffers = buffers;

    const bounds = canvas.getBoundingClientRect();
    graphics.resize(bounds.width, bounds.height);
    graphics.startRendering();

    console.log(graphics);

    window.onresize = function (ev) {
    const bounds = canvas.getBoundingClientRect();
    graphics.resize(bounds.width, bounds.height);
    };

}