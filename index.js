const stereoVertShader = `
attribute vec3 position;
varying vec2 vUv;

void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 1.0);
}
`;

const stereoFragShader = `
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

    for (int i = 0; i < 30; i++) {
        if (x < tileWidth) break;
        float d = texture2D(depthBuffer, vec2(x, y) / iResolution.xy).r;
        x -= (tileWidth - d * maxDepthShift);
    }

    float relativeX = x / tileWidth;
    vec2 patternUV = vec2(relativeX, y / iResolution.y);

    bool isAnchorZone = relativeX < 0.05;
    float anchorNoise = random(vec2(0.5, floor(y)));

    if (isAnchorZone && false) {
        float brightness = (anchorNoise > 0.8) ? 1.0 : 0.0;
        gl_FragColor = vec4(vec3(brightness), 1.0);
    } else {
        gl_FragColor = texture2D(pattern, patternUV);
    }
}
`;

const cubeVertShader = `
attribute vec3 position;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying highp float vDepth;

void main() {
    vec4 mvPosition = uModelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = uProjectionMatrix * mvPosition;
}
`;

const cubeFragShader = `
precision mediump float;
varying highp float vDepth;

void main() {
    float depth = 1.0 - smoothstep(3.0, 7.0, vDepth);
    gl_FragColor = vec4(vec3(depth), 1.0);
}
`;

function init() {
    const canvas = document.getElementById("autostereogram");
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Unable to create shader");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(shader) || "Unknown shader error";
            console.error(msg);
            throw new Error(msg);
        }

        return shader;
    }

    function createProgram(vsSource, fsSource) {
        const program = gl.createProgram();
        if (!program) throw new Error("Unable to create program");
        gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const msg = gl.getProgramInfoLog(program) || "Unknown program error";
            console.error(msg);
            throw new Error(msg);
        }

        return program;
    }

    function resizeCanvasToDisplaySize() {
        const dpr = window.devicePixelRatio || 1;
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width * dpr));
        const height = Math.max(1, Math.floor(bounds.height * dpr));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        return { width: canvas.width, height: canvas.height };
    }

    function createTexture(width, height, filter) {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Unable to create texture");
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
        return texture;
    }

    function createRenderTarget(width, height) {
        const framebuffer = gl.createFramebuffer();
        const colorTexture = createTexture(width, height, gl.LINEAR);
        const depthRenderbuffer = gl.createRenderbuffer();

        if (!framebuffer || !depthRenderbuffer) {
            throw new Error("Unable to create framebuffer resources");
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            colorTexture,
            0
        );

        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            depthRenderbuffer
        );

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error("Framebuffer is incomplete: " + status);
        }

        return { framebuffer, colorTexture, depthRenderbuffer, width, height };
    }

    function resizeRenderTarget(target, width, height) {
        if (target.width === width && target.height === height) return;

        gl.bindTexture(gl.TEXTURE_2D, target.colorTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );

        gl.bindRenderbuffer(gl.RENDERBUFFER, target.depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        target.width = width;
        target.height = height;
    }

    function createTextureFromImage(image) {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Unable to create pattern texture");

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        return texture;
    }

    const stereoProgram = createProgram(stereoVertShader, stereoFragShader);
    const cubeProgram = createProgram(cubeVertShader, cubeFragShader);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1
        ]),
        gl.STATIC_DRAW
    );

    const cubePositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1.0, -1.0, 1.0,  1.0, -1.0, 1.0,  1.0, 1.0, 1.0,  -1.0, 1.0, 1.0,
            -1.0, -1.0, -1.0, -1.0, 1.0, -1.0,  1.0, 1.0, -1.0,  1.0, -1.0, -1.0,
            -1.0, 1.0, -1.0,  -1.0, 1.0, 1.0,   1.0, 1.0, 1.0,   1.0, 1.0, -1.0,
            -1.0, -1.0, -1.0,  1.0, -1.0, -1.0,  1.0, -1.0, 1.0,  -1.0, -1.0, 1.0,
            1.0, -1.0, -1.0,   1.0, 1.0, -1.0,   1.0, 1.0, 1.0,   1.0, -1.0, 1.0,
            -1.0, -1.0, -1.0,  -1.0, -1.0, 1.0,  -1.0, 1.0, 1.0,  -1.0, 1.0, -1.0
        ]),
        gl.STATIC_DRAW
    );

    const cubeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array([
            0, 1, 2, 0, 2, 3,
            4, 5, 6, 4, 6, 7,
            8, 9, 10, 8, 10, 11,
            12, 13, 14, 12, 14, 15,
            16, 17, 18, 16, 18, 19,
            20, 21, 22, 20, 22, 23
        ]),
        gl.STATIC_DRAW
    );

    const stereoPositionLoc = gl.getAttribLocation(stereoProgram, "position");
    const stereoResolutionLoc = gl.getUniformLocation(stereoProgram, "iResolution");
    const stereoPatternLoc = gl.getUniformLocation(stereoProgram, "pattern");
    const stereoDepthLoc = gl.getUniformLocation(stereoProgram, "depthBuffer");

    const cubePositionLoc = gl.getAttribLocation(cubeProgram, "position");
    const cubeModelViewLoc = gl.getUniformLocation(cubeProgram, "uModelViewMatrix");
    const cubeProjectionLoc = gl.getUniformLocation(cubeProgram, "uProjectionMatrix");

    const patternImage = document.getElementById("pattern-image");
    let patternTexture = null;
    let patternReady = false;

    if (patternImage instanceof HTMLImageElement) {
        const uploadPattern = () => {
            patternTexture = createTextureFromImage(patternImage);
            patternReady = true;
        };

        if (patternImage.complete && patternImage.naturalWidth > 0) {
            uploadPattern();
        } else {
            patternImage.onload = uploadPattern;
            patternImage.onerror = () => {
                console.error("Pattern image failed to load");
            };
        }
    }

    let renderTarget = null;
    let currentWidth = 0;
    let currentHeight = 0;
    let cubeRotation = 0;

    function ensureRenderTarget() {
        const size = resizeCanvasToDisplaySize();
        if (!renderTarget || size.width !== currentWidth || size.height !== currentHeight) {
            renderTarget = createRenderTarget(size.width, size.height);
            currentWidth = size.width;
            currentHeight = size.height;
            gl.useProgram(stereoProgram);
            gl.uniform2f(stereoResolutionLoc, currentWidth, currentHeight);
        }
    }

    function drawCubeToTarget(deltaSeconds) {
        if (!renderTarget) return;

        cubeRotation += deltaSeconds;

        gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.framebuffer);
        gl.viewport(0, 0, currentWidth, currentHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        const projectionMatrix = mat4.create();
        mat4.perspective(
            projectionMatrix,
            (45 * Math.PI) / 180,
            currentWidth / currentHeight,
            0.1,
            100.0
        );

        const modelViewMatrix = mat4.create();
        mat4.translate(modelViewMatrix, modelViewMatrix, [0.0, 0.0, -6.0]);
        mat4.rotate(modelViewMatrix, modelViewMatrix, cubeRotation, [0, 0, 1]);
        mat4.rotate(modelViewMatrix, modelViewMatrix, cubeRotation * 0.7, [0, 1, 0]);
        mat4.rotate(modelViewMatrix, modelViewMatrix, cubeRotation * 0.3, [1, 0, 0]);

        gl.useProgram(cubeProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
        gl.vertexAttribPointer(cubePositionLoc, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(cubePositionLoc);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
        gl.uniformMatrix4fv(cubeProjectionLoc, false, projectionMatrix);
        gl.uniformMatrix4fv(cubeModelViewLoc, false, modelViewMatrix);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    }

    function drawStereogram() {
        if (!patternReady || !patternTexture || !renderTarget) return;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, currentWidth, currentHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(stereoProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.vertexAttribPointer(stereoPositionLoc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(stereoPositionLoc);

        gl.uniform2f(stereoResolutionLoc, currentWidth, currentHeight);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, patternTexture);
        gl.uniform1i(stereoPatternLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, renderTarget.colorTexture);
        gl.uniform1i(stereoDepthLoc, 1);

        gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    let lastTime = 0;
    function frame(now) {
        ensureRenderTarget();
        const deltaSeconds = lastTime ? (now - lastTime) / 1000 : 0;
        lastTime = now;

        if (patternReady && renderTarget) {
            drawCubeToTarget(deltaSeconds);
            drawStereogram();
        }

        requestAnimationFrame(frame);
    }

    window.addEventListener("resize", () => {
        currentWidth = 0;
        currentHeight = 0;
        ensureRenderTarget();
    });

    ensureRenderTarget();
    requestAnimationFrame(frame);
}

init();
