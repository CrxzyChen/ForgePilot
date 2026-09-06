import type {
  Quaternion,
  RuntimeDrawableProjection,
  RuntimeRenderSnapshot,
  RuntimeTransform3D,
} from '../../runtime/runtime-session-protocol.ts';

export type WebGlHitRegion = {
  objectId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type Mat4 = Float32Array;

type RendererState = {
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  position: number;
  normal: number;
  viewProjection: WebGLUniformLocation;
  model: WebGLUniformLocation;
  color: WebGLUniformLocation;
  lightDirection: WebGLUniformLocation;
  lightColor: WebGLUniformLocation;
  lightIntensity: WebGLUniformLocation;
  meshes: Map<string, { source: string; buffer: WebGLBuffer; count: number }>;
  materialTexture: WebGLUniformLocation;
  whiteTexture: WebGLTexture;
  textures: Map<string, { source: string; texture: WebGLTexture }>;
};

const states = new WeakMap<WebGL2RenderingContext, RendererState>();

const cube = new Float32Array([
  // position              normal
  -0.5, -0.5, 0.5, 0, 0, 1, 0.5, -0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 1,
  -0.5, -0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 1, -0.5, 0.5, 0.5, 0, 0, 1,
  0.5, -0.5, -0.5, 0, 0, -1, -0.5, -0.5, -0.5, 0, 0, -1, -0.5, 0.5, -0.5, 0, 0,
  -1, 0.5, -0.5, -0.5, 0, 0, -1, -0.5, 0.5, -0.5, 0, 0, -1, 0.5, 0.5, -0.5, 0,
  0, -1, -0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, -0.5, 0, 1,
  0, -0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, -0.5, 0, 1, 0, -0.5, 0.5, -0.5, 0, 1, 0,
  -0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, 0.5, 0, -1,
  0, -0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, 0.5, 0, -1, 0, -0.5, -0.5, 0.5, 0,
  -1, 0, 0.5, -0.5, 0.5, 1, 0, 0, 0.5, -0.5, -0.5, 1, 0, 0, 0.5, 0.5, -0.5, 1,
  0, 0, 0.5, -0.5, 0.5, 1, 0, 0, 0.5, 0.5, -0.5, 1, 0, 0, 0.5, 0.5, 0.5, 1, 0,
  0, -0.5, -0.5, -0.5, -1, 0, 0, -0.5, -0.5, 0.5, -1, 0, 0, -0.5, 0.5, 0.5, -1,
  0, 0, -0.5, -0.5, -0.5, -1, 0, 0, -0.5, 0.5, 0.5, -1, 0, 0, -0.5, 0.5, -0.5,
  -1, 0, 0,
]);

const vertexSource = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec3 vNormal;
out vec2 vUv;
void main() {
  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
  vNormal = normalize(mat3(uModel) * aNormal);
  vUv = aPosition.xz + vec2(0.5);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
uniform vec4 uColor;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform sampler2D uMaterialTexture;
out vec4 outputColor;
void main() {
  float diffuse = max(dot(normalize(vNormal), -normalize(uLightDirection)), 0.0);
  vec3 lighting = vec3(0.22) + uLightColor * diffuse * uLightIntensity;
  vec4 sampled = texture(uMaterialTexture, vUv);
  outputColor = vec4(uColor.rgb * sampled.rgb * lighting, uColor.a * sampled.a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL2 shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? 'WebGL2 shader compilation failed',
    );
  }
  return shader;
}

function requiredUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`WebGL2 uniform ${name} is missing`);
  return location;
}

function createState(gl: WebGL2RenderingContext): RendererState {
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 program allocation failed');
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? 'WebGL2 program link failed',
    );
  }
  const vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) throw new Error('WebGL2 vertex buffer allocation failed');
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
  const whiteTexture = gl.createTexture();
  if (!whiteTexture)
    throw new Error('WebGL2 material texture allocation failed');
  gl.bindTexture(gl.TEXTURE_2D, whiteTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  );
  const state = {
    program,
    vertexBuffer,
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    viewProjection: requiredUniform(gl, program, 'uViewProjection'),
    model: requiredUniform(gl, program, 'uModel'),
    color: requiredUniform(gl, program, 'uColor'),
    lightDirection: requiredUniform(gl, program, 'uLightDirection'),
    lightColor: requiredUniform(gl, program, 'uLightColor'),
    lightIntensity: requiredUniform(gl, program, 'uLightIntensity'),
    meshes: new Map(),
    materialTexture: requiredUniform(gl, program, 'uMaterialTexture'),
    whiteTexture,
    textures: new Map(),
  };
  states.set(gl, state);
  return state;
}

function imageTexture(
  gl: WebGL2RenderingContext,
  state: RendererState,
  path: string,
  source: string,
  image: HTMLImageElement,
) {
  const existing = state.textures.get(path);
  if (existing?.source === source) return existing.texture;
  if (existing) gl.deleteTexture(existing.texture);
  const texture = gl.createTexture();
  if (!texture)
    throw new Error(`WebGL2 could not allocate material texture ${path}`);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  state.textures.set(path, { source, texture });
  return texture;
}

function decodeDataUrl(source: string): string {
  const comma = source.indexOf(',');
  if (comma < 0) return '';
  const header = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  return header.includes(';base64')
    ? atob(payload)
    : decodeURIComponent(payload);
}

function parseObj(source: string): Float32Array {
  const positions: number[][] = [];
  const normals: number[][] = [];
  const output: number[] = [];
  const vertex = (reference: string) => {
    const [positionIndex, , normalIndex] = reference.split('/').map(Number);
    const position = positions[(positionIndex || 1) - 1] ?? [0, 0, 0];
    const normal = normalIndex ? normals[normalIndex - 1] : undefined;
    return { position, normal };
  };
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.startsWith('v '))
      positions.push(line.slice(2).trim().split(/\s+/u).map(Number));
    if (line.startsWith('vn '))
      normals.push(line.slice(3).trim().split(/\s+/u).map(Number));
    if (!line.startsWith('f ')) continue;
    const face = line.slice(2).trim().split(/\s+/u);
    for (let index = 1; index + 1 < face.length; index += 1) {
      const triangle = [
        vertex(face[0]),
        vertex(face[index]),
        vertex(face[index + 1]),
      ];
      const [a, b, c] = triangle.map((entry) => entry.position);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(...cross) || 1;
      const faceNormal = cross.map((value) => value / length);
      for (const entry of triangle)
        output.push(...entry.position, ...(entry.normal ?? faceNormal));
    }
  }
  if (!output.length)
    throw new Error('Imported OBJ has no triangulatable faces');
  return new Float32Array(output);
}

function meshBuffer(
  gl: WebGL2RenderingContext,
  state: RendererState,
  path: string,
  source: string,
) {
  const existing = state.meshes.get(path);
  if (existing?.source === source) return existing;
  if (existing) gl.deleteBuffer(existing.buffer);
  const vertices = parseObj(decodeDataUrl(source));
  const buffer = gl.createBuffer();
  if (!buffer)
    throw new Error(`WebGL2 could not allocate imported mesh ${path}`);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const mesh = { source, buffer, count: vertices.length / 6 };
  state.meshes.set(path, mesh);
  return mesh;
}

function multiply(left: Mat4, right: Mat4): Mat4 {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += left[index * 4 + row] * right[column * 4 + index];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

function quaternionMatrix([x, y, z, w]: Quaternion): Mat4 {
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  return new Float32Array([
    1 - y * y2 - z * z2,
    x * y2 + w * z2,
    x * z2 - w * y2,
    0,
    x * y2 - w * z2,
    1 - x * x2 - z * z2,
    y * z2 + w * x2,
    0,
    x * z2 + w * y2,
    y * z2 - w * x2,
    1 - x * x2 - y * y2,
    0,
    0,
    0,
    0,
    1,
  ]);
}

function multiplyQuaternion(left: Quaternion, right: Quaternion): Quaternion {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  const value: Quaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const length = Math.hypot(...value) || 1;
  return [
    value[0] / length,
    value[1] / length,
    value[2] / length,
    value[3] / length,
  ];
}

function modelMatrix(transform: RuntimeTransform3D): Mat4 {
  const result = quaternionMatrix(transform.rotation);
  for (let row = 0; row < 3; row += 1) {
    result[row] *= transform.scale[0];
    result[4 + row] *= transform.scale[1];
    result[8 + row] *= transform.scale[2];
  }
  result[12] = transform.position[0];
  result[13] = transform.position[1];
  result[14] = transform.position[2];
  return result;
}

function viewMatrix(transform: RuntimeTransform3D): Mat4 {
  const [x, y, z, w] = transform.rotation;
  const inverseRotation = quaternionMatrix([-x, -y, -z, w]);
  const [tx, ty, tz] = transform.position;
  inverseRotation[12] = -(
    inverseRotation[0] * tx +
    inverseRotation[4] * ty +
    inverseRotation[8] * tz
  );
  inverseRotation[13] = -(
    inverseRotation[1] * tx +
    inverseRotation[5] * ty +
    inverseRotation[9] * tz
  );
  inverseRotation[14] = -(
    inverseRotation[2] * tx +
    inverseRotation[6] * ty +
    inverseRotation[10] * tz
  );
  return inverseRotation;
}

function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * range,
    -1,
    0,
    0,
    2 * far * near * range,
    0,
  ]);
}

function projectBounds(
  drawable: RuntimeDrawableProjection,
  viewProjection: Mat4,
  width: number,
  height: number,
): WebGlHitRegion | null {
  if (!drawable.transform3d) return null;
  const matrix = multiply(viewProjection, modelMatrix(drawable.transform3d));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const clipX =
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const clipY =
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const clipW =
          matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
        if (clipW <= 0.0001) continue;
        xs.push(((clipX / clipW) * 0.5 + 0.5) * width);
        ys.push((0.5 - (clipY / clipW) * 0.5) * height);
      }
    }
  }
  if (!xs.length) return null;
  return {
    objectId: drawable.objectId,
    left: Math.max(0, Math.min(...xs)),
    top: Math.max(0, Math.min(...ys)),
    right: Math.min(width, Math.max(...xs)),
    bottom: Math.min(height, Math.max(...ys)),
  };
}

export function drawWebGl3D(input: {
  canvas: HTMLCanvasElement;
  snapshot: RuntimeRenderSnapshot;
  width: number;
  height: number;
  pixelRatio: number;
  assetSources?: Readonly<Record<string, string>>;
  images?: ReadonlyMap<string, HTMLImageElement>;
  editorNavigation?: Readonly<{
    yaw: number;
    pitch: number;
    distance: number;
    panX: number;
    panY: number;
  }>;
}): WebGlHitRegion[] {
  const {
    canvas,
    snapshot,
    width,
    height,
    pixelRatio,
    assetSources = {},
    images,
    editorNavigation,
  } = input;
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('Studio requires WebGL2 for 3D scenes');
  const state = states.get(gl) ?? createState(gl);
  const camera =
    snapshot.payload.cameras.find(
      (candidate) => candidate.space === '3d' && candidate.primary,
    ) ?? snapshot.payload.cameras.find((candidate) => candidate.space === '3d');
  const baseCameraTransform = camera?.transform3d ?? {
    position: [0, 6, 12],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
  const navigation = editorNavigation ?? {
    yaw: 0,
    pitch: 0,
    distance: 1,
    panX: 0,
    panY: 0,
  };
  const yawHalf = navigation.yaw / 2;
  const pitchHalf = navigation.pitch / 2;
  const navigationRotation = multiplyQuaternion(
    [0, Math.sin(yawHalf), 0, Math.cos(yawHalf)],
    [Math.sin(pitchHalf), 0, 0, Math.cos(pitchHalf)],
  );
  const cameraTransform: RuntimeTransform3D = {
    position: [
      baseCameraTransform.position[0] * navigation.distance + navigation.panX,
      baseCameraTransform.position[1] * navigation.distance + navigation.panY,
      baseCameraTransform.position[2] * navigation.distance,
    ],
    rotation: multiplyQuaternion(
      baseCameraTransform.rotation,
      navigationRotation,
    ),
    scale: baseCameraTransform.scale,
  };
  const viewProjection = multiply(
    perspective(
      camera?.verticalFovRadians ?? Math.PI / 3,
      width / Math.max(1, height),
      camera?.near ?? 0.1,
      camera?.far ?? 1_000,
    ),
    viewMatrix(cameraTransform),
  );
  const clear = camera?.clearColor ?? [0.03, 0.05, 0.075, 1];
  gl.viewport(0, 0, pixelWidth, pixelHeight);
  gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
  gl.clearDepth(1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(state.program);
  gl.enableVertexAttribArray(state.position);
  gl.enableVertexAttribArray(state.normal);
  gl.uniformMatrix4fv(state.viewProjection, false, viewProjection);
  const light = snapshot.payload.lights[0];
  gl.uniform3fv(state.lightDirection, light?.direction ?? [0.35, -1, 0.25]);
  gl.uniform3fv(state.lightColor, (light?.color ?? [1, 1, 1, 1]).slice(0, 3));
  gl.uniform1f(state.lightIntensity, light?.intensity ?? 1);
  gl.uniform1i(state.materialTexture, 0);
  const regions: WebGlHitRegion[] = [];
  for (const drawable of snapshot.payload.drawables) {
    if (!drawable.visible || drawable.space !== '3d' || !drawable.transform3d)
      continue;
    const imported = drawable.asset
      ? assetSources[drawable.asset.projectPath]
      : undefined;
    const geometry = imported
      ? meshBuffer(gl, state, drawable.asset!.projectPath, imported)
      : { buffer: state.vertexBuffer, count: 36 };
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    gl.vertexAttribPointer(state.position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(state.normal, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(state.model, false, modelMatrix(drawable.transform3d));
    gl.uniform4fv(state.color, drawable.tint ?? [0.55, 0.65, 0.72, 1]);
    const texturePath = drawable.texture?.projectPath;
    const image = texturePath ? images?.get(texturePath) : undefined;
    const texture =
      texturePath && image?.complete && image.naturalWidth > 0
        ? imageTexture(
            gl,
            state,
            texturePath,
            assetSources[texturePath] ?? image.src,
            image,
          )
        : state.whiteTexture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, geometry.count);
    const region = projectBounds(drawable, viewProjection, width, height);
    if (region) regions.push(region);
  }
  return regions;
}
