import type { RenderableCameraFrame } from "./camera-frame-renderer";
import {
  getCoverLayout,
  type RecordingAvatarMask,
  type RenderSize,
} from "./pose-renderer";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_screen;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_screen = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_frame;
uniform vec4 u_crop;
uniform vec2 u_resolution;
uniform vec2 u_avatar_center;
uniform float u_avatar_radius;
uniform float u_avatar_style;
varying vec2 v_screen;

float circle(vec2 point, vec2 center, float radius) {
  return length(point - center) / radius;
}

void main() {
  vec2 texture_point = vec2(
    mix(u_crop.z, u_crop.x, v_screen.x),
    mix(u_crop.y, u_crop.w, v_screen.y)
  );
  vec4 color = texture2D(u_frame, texture_point);

  if (u_avatar_style > 0.5 && u_avatar_radius > 0.0) {
    vec2 local = (v_screen - u_avatar_center) * u_resolution / u_avatar_radius;
    float distance_from_center = length(local);

    if (distance_from_center <= 1.0) {
      vec3 outline = vec3(0.09, 0.10, 0.075);
      vec3 skin = vec3(0.96, 0.73, 0.49);
      vec3 hair = u_avatar_style < 1.5
        ? vec3(0.16, 0.10, 0.065)
        : vec3(0.25, 0.12, 0.075);
      color = vec4(distance_from_center > 0.91 ? outline : skin, 1.0);

      float hair_line = -0.42 + 0.10 * cos(local.x * 5.8);
      bool top_hair = local.y < hair_line;
      bool side_hair = u_avatar_style > 1.5 && abs(local.x) > 0.68 && local.y < 0.52;
      if (top_hair || side_hair) {
        color = vec4(hair, 1.0);
      }

      float left_eye = circle(local, vec2(-0.31, -0.05), 0.075);
      float right_eye = circle(local, vec2(0.31, -0.05), 0.075);
      if (left_eye < 1.0 || right_eye < 1.0) {
        color = vec4(outline, 1.0);
      }

      float mouth = circle(local, vec2(0.0, 0.39), 0.21);
      float mouth_cutout = circle(local, vec2(0.0, 0.31), 0.22);
      if (mouth < 1.0 && mouth_cutout > 1.0) {
        color = vec4(outline, 1.0);
      }
    }
  }

  gl_FragColor = color;
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("MASKED_VIDEO_SHADER_UNAVAILABLE");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`MASKED_VIDEO_SHADER_COMPILE_FAILED: ${message}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("MASKED_VIDEO_PROGRAM_UNAVAILABLE");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`MASKED_VIDEO_PROGRAM_LINK_FAILED: ${message}`);
  }
  return program;
}

function requireUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`MASKED_VIDEO_UNIFORM_UNAVAILABLE: ${name}`);
  return location;
}

/** Renders the camera and an opaque avatar into the WebGL surface recorded by WeChat. */
export class MaskedVideoRenderer {
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly frameUniform: WebGLUniformLocation;
  private readonly cropUniform: WebGLUniformLocation;
  private readonly resolutionUniform: WebGLUniformLocation;
  private readonly avatarCenterUniform: WebGLUniformLocation;
  private readonly avatarRadiusUniform: WebGLUniformLocation;
  private readonly avatarStyleUniform: WebGLUniformLocation;

  constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly output: RenderSize,
  ) {
    this.program = createProgram(gl);
    const position = gl.getAttribLocation(this.program, "a_position");
    if (position < 0) throw new Error("MASKED_VIDEO_POSITION_UNAVAILABLE");

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) throw new Error("MASKED_VIDEO_RESOURCE_UNAVAILABLE");
    this.texture = texture;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.frameUniform = requireUniform(gl, this.program, "u_frame");
    this.cropUniform = requireUniform(gl, this.program, "u_crop");
    this.resolutionUniform = requireUniform(gl, this.program, "u_resolution");
    this.avatarCenterUniform = requireUniform(gl, this.program, "u_avatar_center");
    this.avatarRadiusUniform = requireUniform(gl, this.program, "u_avatar_radius");
    this.avatarStyleUniform = requireUniform(gl, this.program, "u_avatar_style");

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.frameUniform, 0);
    gl.uniform2f(this.resolutionUniform, output.width, output.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, output.width, output.height);
  }

  draw(frame: RenderableCameraFrame, mask: RecordingAvatarMask): void {
    const { gl, output } = this;
    if (frame.width <= 0 || frame.height <= 0) return;
    const pixels = new Uint8Array(frame.data);
    if (pixels.length < frame.width * frame.height * 4) {
      throw new Error("MASKED_VIDEO_FRAME_RGBA_LENGTH_MISMATCH");
    }

    const layout = getCoverLayout(frame, output);
    const sourceLeft = Math.max(0, -layout.offsetX / layout.renderedWidth);
    const sourceTop = Math.max(0, -layout.offsetY / layout.renderedHeight);
    const sourceRight = Math.min(
      1,
      (output.width - layout.offsetX) / layout.renderedWidth,
    );
    const sourceBottom = Math.min(
      1,
      (output.height - layout.offsetY) / layout.renderedHeight,
    );

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      frame.width,
      frame.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    gl.uniform4f(
      this.cropUniform,
      sourceLeft,
      sourceTop,
      sourceRight,
      sourceBottom,
    );
    gl.uniform2f(
      this.avatarCenterUniform,
      mask.centerX / output.width,
      mask.centerY / output.height,
    );
    gl.uniform1f(this.avatarRadiusUniform, mask.radius);
    gl.uniform1f(this.avatarStyleUniform, mask.avatar === "man" ? 1 : 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // requestFrame captures after its callback returns. Finish the GPU work so
    // the recorder can never capture the camera texture before the mask pass.
    gl.finish();
  }
}
