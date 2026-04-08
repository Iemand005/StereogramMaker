
/**
 * @param {HTMLCanvasElement} canvas
 */
function Graphics3D(canvas) {
  /* @type {HTMLCanvasElement} */
  this.canvas = canvas;
  this.gl = canvas.getContext("webgl");
  this.ie11 = false;
  if (!this.gl) {
    this.gl = canvas.getContext("experimental-webgl");
    if (this.gl) this.ie11 = true;
  }

  this.gl.clearColor(0, 0, 0, 0);

  this.buffers = {
    position: [],
    indices: [],
    color: []
  };

  this.renderTarget = null;


  this.onrender = function () {};
}

Graphics3D.prototype.clear = function () {
  this.gl.clear(this.gl.COLOR_BUFFER_BIT);
};

Graphics3D.prototype.setClearColor = function (r, g, b, a) {
    this.gl.clearColor(r, g, b, a);
};

Graphics3D.prototype.setRenderTarget = function (renderTarget) {
  this.renderTarget = renderTarget;
};

Graphics3D.prototype.loadShader = function (type, source) {
  const shader = this.gl.createShader(type);
  this.gl.shaderSource(shader, source);
  this.gl.compileShader(shader);

  // See if it compiled successfully

  if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
    alert(
      "An error occurred compiling the shaders: " +
        this.gl.getShaderInfoLog(shader)
    );
    this.gl.deleteShader(shader);
    return null;
  }

  return shader;
};

Graphics3D.prototype.initShaderProgram = function (vsSource, fsSource) {
  const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
  const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = this.gl.createProgram();
  this.gl.attachShader(shaderProgram, vertexShader);
  this.gl.attachShader(shaderProgram, fragmentShader);
  this.gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
    alert(
      "Unable to initialize the shader program: " +
        this.gl.getProgramInfoLog(shaderProgram)
    );
    return null;
  }

  return shaderProgram;
};

Graphics3D.prototype.loadShaders = function (vsSource, fsSource) {
  const gl = this.gl;
  this.shaderProgram = this.initShaderProgram(vsSource, fsSource);

  const positionBuffer = gl.createBuffer();

  // Select the positionBuffer as the one to apply buffer
  // operations to from here out.
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Now create an array of positions for the square.
  const positions = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  
  this.programInfo = {
  program: this.shaderProgram,
  attribLocations: {
    vertexPosition: this.gl.getAttribLocation(
      this.shaderProgram,
      "aVertexPosition"
    ),
    vertexColor: this.gl.getAttribLocation(this.shaderProgram, "aVertexColor")
  },
  uniformLocations: {
    projectionMatrix: this.gl.getUniformLocation(
      this.shaderProgram,
      "uProjectionMatrix"
    ),
    modelViewMatrix: this.gl.getUniformLocation(
      this.shaderProgram,
      "uModelViewMatrix"
    )
  }
};
};

let squareRotation = 0.0;
let deltaTime = 0;
// let now = 0;
let then = 0;

Graphics3D.prototype.drawScene = function (programInfo, deltaTime) {
  const gl = this.gl;
  if (!gl) return;

  if (this.renderTarget) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.framebuffer);
    gl.viewport(0, 0, this.renderTarget.width, this.renderTarget.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  gl.clearDepth(1.0); // Clear everything
  gl.enable(gl.DEPTH_TEST); // Enable depth testing
  gl.depthFunc(gl.LEQUAL); // Near things obscure far things

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.clearDepth(1.0);

  const fov = 45;

  const fieldOfView = (fov * Math.PI) / 180; // in radians
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  // note: glMatrix always has the first argument
  // as the destination to receive the result.
  // gl.gM
  mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  const modelViewMatrix = mat4.create();

  squareRotation += deltaTime;
  mat4.translate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to translate
    [-0.0, 0.0, -6.0]
  ); // amount to translate

  mat4.rotate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to rotate
    squareRotation, // amount to rotate in radians
    [0, 0, 1]
  ); // axis to rotate around (Z)
  mat4.rotate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to rotate
    squareRotation * 0.7, // amount to rotate in radians
    [0, 1, 0]
  ); // axis to rotate around (Y)
  mat4.rotate(
    modelViewMatrix, // destination matrix
    modelViewMatrix, // matrix to rotate
    squareRotation * 0.3, // amount to rotate in radians
    [1, 0, 0]
  ); // axis to rotate around (X)

  // Tell WebGL how to pull out the positions from the position
  // buffer into the vertexPosition attribute.
  {
    const numComponents = 3; // pull out 3 values per iteration (x, y, z)
    const type = gl.FLOAT; // the data in the buffer is 32bit floats
    const normalize = false; // don't normalize
    const stride = 0; // how many bytes to get from one set of values to the next
    // 0 = use type and numComponents above
    const offset = 0; // how many bytes inside the buffer to start from
    if (!this.buffers) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.vertexAttribPointer(
      this.programInfo.attribLocations.vertexPosition,
      numComponents,
      type,
      normalize,
      stride,
      offset
    );
    gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
  }

  const numComponents = 4;
  const type = gl.FLOAT;
  const normalize = false;
  const stride = 0;
  const offset = 0;
  if (this.programInfo.attribLocations.vertexColor !== -1) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
    gl.vertexAttribPointer(
      this.programInfo.attribLocations.vertexColor,
      numComponents,
      type,
      normalize,
      stride,
      offset
    );
    gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexColor);
  }

  // Tell WebGL to use our program when drawing
  gl.useProgram(this.programInfo.program);

  // Set the shader uniforms
  gl.uniformMatrix4fv(
    this.programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  );
  gl.uniformMatrix4fv(
    this.programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );

  {
    // const offset = 0;
    // const vertexCount = 4;
    // gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);

    const vertexCount = 36;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
};

// Graphics.prototype.render = function () {

// };

Graphics3D.prototype.render = function (now) {
  now *= 0.001; // convert to seconds
  deltaTime = now - then;
  then = now;

  // console.log(this);
  // console.log(deltaTime);
  this.drawScene(this.programInfo, deltaTime);
  // squareRotation += deltaTime;

  requestAnimationFrame(Graphics3D.prototype.render.bind(this));
};

Graphics3D.prototype.startRendering = function () {
  requestAnimationFrame(Graphics3D.prototype.render.bind(this));
};

Graphics3D.prototype.resize = function (width, height) {
  return;
  const dpr = window.devicePixelRatio || 1;
  this.canvas.width = width * dpr;
  this.canvas.height = height * dpr;
  this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  // ctx.scale(dpr, dpr);
  if (this.gl.scale) this.gl.scale(dpr, dpr);
};

// export { drawScene };
