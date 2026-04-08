const vertShader = `
attribute vec3 position; // The x,y,z coordinates of our rectangle corners
varying vec2 vUv;        // This passes the coordinates to the Pixel Shader

void main() {
    // 1. Pass the position to the fragment shader as a UV (0 to 1)
    // Most full-screen quads go from -1 to 1, so we map that to 0 to 1
    vUv = position.xy * 0.5 + 0.5;

    // 2. Tell the GPU where the vertex is in 3D space
    gl_Position = vec4(position, 1.0);
}
`;

const fragShader = `
precision highp float;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
varying vec2 vUv;

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float numTiles = 6.0;
    float maxDepthShift = 20.0;
    
    float tileWidth = iResolution.x / numTiles;
    
    float currX = fragCoord.x;
    float y = fragCoord.y;

    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord / iResolution.xy;

    // Get depth value for pixel
    float depth = texture2D(iChannel1, uv).r;
    
    // while (currX > tileWidth) {
    for (int i = 0; i < 30; i++) {
        // Get depth at the current spot (0.0 to 1.0)
        float depth = texture2D(iChannel1, vec2(currX, y) / iResolution.xy).r;
        
        // Subtract the tile width, but shift it slightly based on depth
        // More depth (whiter) = smaller jump = pixels look "closer"
        currX -= (tileWidth - depth * maxDepthShift);
    }
    
    
    // Get the colour of the offset texture coordinates
    vec4 col = texture2D(iChannel1, uv + vec2(depth * 0.1, 0.0));
    

    // Output to screen
    vec2 patternUV = vec2(currX / tileWidth, y / iResolution.y);
    fragColor = texture2D(iChannel0, patternUV);
    // fragColor
}

// void main() {
//     // mainImage(gl_FragColor, gl_FragCoord.xy);
//     // vec4 col = texture2D(iChannel0, vUv);


//     for (int i = 0; i < 30; i++) {
//         // Get depth at the current spot (0.0 to 1.0)
//         float depth = texture2D(iChannel1, vec2(currX, y) / iResolution.xy).r;
        
//         // Subtract the tile width, but shift it slightly based on depth
//         // More depth (whiter) = smaller jump = pixels look "closer"
//         currX -= (tileWidth - depth * maxDepthShift);
//     }
    

//     gl_FragColor = col;
//     // gl_FragColor = texture2D(iChannel0, vUv);
// }

void main() {
    // 1. Settings
    float numTiles = 6.0; 
    float maxDepthShift = 20.0; // Adjust this for more/less 3D pop
    float tileWidth = iResolution.x / numTiles;
    
    // 2. Current pixel in raw coordinates
    float currX = gl_FragCoord.x;
    float y = gl_FragCoord.y;

    // 3. The Stereogram Trace-Back Loop
    // We look to the left repeatedly, shifting slightly based on depth.
    for (int i = 0; i < 30; i++) {
        if (currX < tileWidth) break;
        
        // IMPORTANT: Normalize coordinates to [0,1] for texture2D
        vec2 depthUV = vec2(currX, y) / iResolution.xy;
        float depth = texture2D(iChannel1, depthUV).r;
        
        // Shift jump: standard width minus the depth-based "pinch"
        currX -= (tileWidth - depth * maxDepthShift);
    }
    
    // 4. Sample the pattern using the final X we landed on
    // Normalize X by tileWidth so the pattern repeats properly
    vec2 patternUV = vec2(currX / tileWidth, y / iResolution.y);
    gl_FragColor = texture2D(iChannel0, patternUV);
}
`;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('autostereogram');
const gl = canvas.getContext('webgl');

function createShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);

if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const msg = gl.getShaderInfoLog(s);
        console.error(msg);
        alert("Shader Error: " + msg);
        return null;
    }

    return s;
}

const program = gl.createProgram();
gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertShader));
gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragShader));
gl.linkProgram(program);
gl.useProgram(program);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

const posLoc = gl.getAttribLocation(program, "position");
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

// Set Resolution Uniform
const resLoc = gl.getUniformLocation(program, "iResolution");
gl.uniform2f(resLoc, canvas.width, canvas.height);

// --- TEXTURE LOADING HELPER ---
function loadTexture(url, index) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    // Set wrapping to REPEAT so the pattern tiles
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    const img = new Image();
    img.onload = () => {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        draw(); // Draw once the image is ready
    };
    img.crossOrigin = "anonymous";
    img.src = url;
    document.body.appendChild(img);
    return tex;
}

// Set Texture Uniforms
gl.uniform1i(gl.getUniformLocation(program, "iChannel0"), 0);
gl.uniform1i(gl.getUniformLocation(program, "iChannel1"), 1);

// Load your local images here
loadTexture('image.png', 0); 
loadTexture('shark.png', 1);

function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
