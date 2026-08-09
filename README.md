# 运动计数

一个只面向手机的实时运动计数 Web App。用户选择动作、设置目标次数并允许相机后，应用会在设备本机运行 MediaPipe Pose Landmarker，把 33 个身体关键点绘制在镜像画面上，用动作状态机确认每一次完整动作，并通过声音和振动反馈计数。

## 已支持

- 深蹲：膝角、髋角与髋部下降
- 俯卧撑：肘角、身体直线与身体朝向
- 开合跳：双臂角度与脚踝间距
- 弓步蹲：双膝角度与前后步幅
- 可选无头像、男性或女性 Emoji 录屏头像
- 训练录屏仅保存在浏览器本机，并可在记录页播放和导出
- 首页 / 记录双页导航，记录按完成时间倒序展示
- Lite / Full 模型自动选择、GPU 推理与 CPU 降级
- 相机权限、无相机、相机占用和识别器加载错误提示
- 暂停、声音开关、训练计时、目标完成页
- 手机安全区、移动横竖屏、高对比度与减少动态效果

## 技术栈

- React 19.2
- TypeScript 7
- Vite 8
- `@mediapipe/tasks-vision` 1.0.1
- Vitest 4

逐帧推理不进入 React state。主线程通过 `requestVideoFrameCallback` 获取视频帧，使用 transferable `ImageBitmap` 发送给 module Web Worker；Worker 中同步调用 `detectForVideo()`，结果返回后主线程才发送下一帧，以避免积压。Canvas 直接绘制骨架，React 只更新次数、阶段和提示文案。

训练开始后，应用会把镜像相机画面、骨架和可选 Emoji 头像合成到独立 Canvas，并用浏览器原生 `MediaRecorder` 录制。输出最高为 720p、30 fps；运行时优先选择 MP4/H.264，无法使用时回退 WebM。完成训练后，视频 Blob 与记录元数据会原子写入 IndexedDB，不会进行 Base64 转换。

## 本地运行

要求 Node.js `^20.19.0` 或 `>=22.12.0`，使用 pnpm：

```bash
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`。浏览器摄像头只允许在 HTTPS 或 localhost 安全上下文中使用。真机调试时请使用受信任的 HTTPS 地址，不能直接用局域网 HTTP IP。

其他命令：

```bash
pnpm test
pnpm build
pnpm preview
```

安装和构建前会把 MediaPipe WASM 资源复制到 `public/wasm`。模型固定在 `public/models`，运行时不依赖 `@latest` CDN。

## 模型来源

- [Pose Landmarker Lite](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task)
- [Pose Landmarker Full](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task)
- [Google Pose Landmarker Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [官方 TypeScript / Vite / Worker 示例](https://github.com/google-ai-edge/mediapipe-samples-web)

MediaPipe 与模型使用 Apache-2.0 许可；参见 [BlazePose GHUM 3D 模型卡](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)。

## 许可证

除另有说明外，本项目的原创源代码采用 [MIT License](LICENSE) 授权。
MediaPipe SDK、随应用分发的 WASM 运行时、Pose Landmarker 模型以及引用的
Google Developers 示例代码仍采用 Apache License 2.0。完整的第三方来源、
署名和许可证信息参见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 隐私与限制

摄像头画面在当前设备内进行推理，本应用不会把图像帧上传到自己的服务器或 Google。MediaPipe Tasks 的官方包说明 SDK 可能发送 API 性能与使用指标；正式发布前应根据适用地区完成 telemetry 告知、同意与隐私合规评估。

录屏属于浏览器站点数据，可能在用户清理浏览器数据、系统回收存储空间或无痕模式结束后消失；需要长期保存时应从记录页导出。当前录屏不包含麦克风，也不会把计数提示音写进视频。

单摄像头姿态估计会受弱光、运动模糊、遮挡、服装和拍摄角度影响。当前阈值适合健身动作计数，不是医疗级姿态测量，也不应把深度坐标解释为精确距离。上线前应使用目标设备和真实训练样本继续校准各动作阈值。
