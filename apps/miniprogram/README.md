# 微信小程序

这是 Workout Detect 的微信原生小程序客户端。界面层使用 WXML/WXSS/TypeScript，姿态识别使用 VisionKit，动作规则与 Web 端共用 `packages/core`。

## 导入

在仓库根目录执行：

```bash
pnpm install
pnpm mini:prepare
```

在微信开发者工具中选择“导入项目”，目录选择 `apps/miniprogram`。游客 AppID 只适合查看基础工程；真机调试前请把 `project.config.json` 中的 `appid` 替换为实际 AppID，并使用当前稳定版基础库。

项目通过 `project.config.json` 的 `setting.useCompilerPlugins` 启用微信 TypeScript 编译插件。修改该配置后需要重新打开项目或执行“清缓存并编译”；如果插件未启用，WXML 静态内容仍可能显示，但页面数据、列表和点击事件都不会加载。

共享核心由 `scripts/sync-core.mjs` 自动生成到 `miniprogram/shared/core`。该目录已被 Git 忽略，不能直接修改。

## 录像策略

训练开始后，小程序会按“录屏头像”设置选择录像链路：

- 页面显示的是 `onCameraFrame` 返回的同源画面，VisionKit 识别点与预览共用同一套裁剪和镜像坐标，避免原生 `<camera>` 预览在不同设备上的裁剪差异导致骨架错位。
- 相机帧用于 VisionKit 本机识别、计数和屏幕骨架绘制。
- 选择“不遮挡”时，录像由 `CameraContext.startRecord()` 直接生成，不包含骨架、计数卡片或其他页面 UI。
- 选择男生或女生头像时，只把“相机画面 + 不透明面部头像”提交给 WebGL `MediaRecorder`；没有完整面部定位的帧不会写入录像。
- 设备不支持 WebGL 画面录制、面部定位不完整或合成失败时，不会降级保存原始相机录像。
- 达到目标会保存录像；手动结束时，只有有效训练时长达到 10 秒才保存。
- 单段录像最长 300 秒，记录保存在小程序本机文件和 Storage 中。

## 提交前验收

```bash
pnpm mini:check
pnpm test
pnpm build
```

至少使用一台 iOS 和一台 Android 真机检查：

1. 首次相机授权、拒绝授权和重新授权流程。
2. 前置相机预览与骨架左右方向一致。
3. 四种动作的关键点可见性、起止姿势和计数阈值。
4. 识别、骨架绘制和录像同时运行时的帧率与发热。
5. 达标、训练不足 10 秒、训练超过 10 秒和 300 秒超时的保存行为。
6. 记录播放、保存到相册、删除和存储空间不足场景。
7. 分别选择“不遮挡”、男生和女生，检查保存的 MP4：不遮挡录像保持原始画面；头像录像从第一帧到最后一帧均有不透明遮挡，快速转头或丢失面部定位时不得写入裸脸帧。
8. 在不支持 `wx.createMediaRecorder`、WebGL 初始化失败和录制中断时，确认页面明确显示不录屏，记录列表中没有新增原始录像。
