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
    float maxDepthShift = 20.0; // Adjust this for more/less 3D pop
    float tileWidth = iResolution.x / numTiles;
    
    // 2. Current pixel in raw coordinates
    float currX = gl_FragCoord.x;
    float y = gl_FragCoord.y;

    bool deep = texture2D(depthBuffer, gl_FragCoord.xy).x > 0.01;

    // 3. The Stereogram Trace-Back Loop
    // We look to the left repeatedly, shifting slightly based on depth.
    for (int i = 0; i < 30; i++) {
        if (currX < tileWidth) break;
        
        // IMPORTANT: Normalize coordinates to [0,1] for texture2D
        vec2 depthUV = vec2(currX, y) / iResolution.xy;
        float depth = texture2D(depthBuffer, depthUV).r;

        // if (depth > 0.01) deep = true;
        
        // Shift jump: standard width minus the depth-based "pinch"
        currX -= (tileWidth - depth * maxDepthShift);
    }
    
    // 4. Sample the pattern using the final X we landed on
    // Normalize X by tileWidth so the pattern repeats properly
    vec2 patternUV = vec2(currX / tileWidth, y / iResolution.y);
    //gl_FragColor = texture2D(pattern, patternUV);
    /// I hope yo
    gl_FragColor = vec4(vec3(random(patternUV)), 1); 
    // if (deep) gl_FragColor *= vec4(1,0,0,1);
    if (patternUV.x < 0.1) if (random(patternUV) > 0.9) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
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


