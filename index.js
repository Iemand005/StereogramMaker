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
uniform sampler2D iChannel0; // Your Depth Map
uniform sampler2D iChannel1;

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
    float depth = texture(iChannel1, uv).r;
    
    while (currX > tileWidth) {
        // Get depth at the current spot (0.0 to 1.0)
        float depth = texture(iChannel1, vec2(currX, y) / iResolution.xy).r;
        
        // Subtract the tile width, but shift it slightly based on depth
        // More depth (whiter) = smaller jump = pixels look "closer"
        currX -= (tileWidth - depth * maxDepthShift);
    }
    
    
    // Get the colour of the offset texture coordinates
    vec4 col = texture(iChannel1, uv + vec2(depth * 0.1, 0.0));
    

    // Output to screen
    vec2 patternUV = vec2(currX / tileWidth, y / iResolution.y);
    fragColor = texture(iChannel0, patternUV);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

function createShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
}

const program = gl.createProgram();
gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertSource));
gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragSource));
gl.linkProgram(program);
gl.useProgram(program);