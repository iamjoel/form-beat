# Motion Lab

Form Beat 的内部健身动作数据后台。首页管理 SQLite 中的动作项目，编辑页用于调整 MediaPipe 33 点骨骼、角度标注、关键帧和动作时长，并导出 JSON 或动画 GIF。

## 启动

从仓库根目录运行：

```bash
pnpm admin:dev
```

需要 Node.js `>=22.12.0`，因为本地数据服务使用 Node 内置的 `node:sqlite`。打开 `http://localhost:5174/` 即可进入动作列表。

生产构建输出到 `dist/admin`：

```bash
pnpm admin:build
```

## 数据存储

- 动作数据保存在 `apps/admin/data/motions.sqlite`。
- 数据库与 WAL 临时文件已加入 `.gitignore`，不会提交到 Git。
- 列表页只负责搜索和打开动作，不提供页面内创建入口。新动作统一通过 `create-fitness-motion` Skill 写入，创建后会自动出现在列表中。
- 编辑器修改会先在界面显示保存状态，再自动写回 SQLite。浏览器 `localStorage` 只保留一份恢复备份，不作为列表数据源。

## 编辑方式

- 在时间轴选择关键帧，再拖动画布上的关节调整姿势。
- 点击骨骼线段后按 `Delete` 或 `Backspace` 移除。恢复时按住 `Shift` 依次选择原来的两个关节；若这条历史连线可以恢复，画布会显示虚线，双击虚线即可添加回来。
- 在“标注”面板添加关节角度；角度数值自动计算，画布上的数字可以拖动。
- 在任意播放位置添加关键帧时，会复制该时刻的补间姿势。
- 在“项目”面板设置动作时长、补间方式、循环、GIF 尺寸和帧率。
- 项目会自动保存到 SQLite，也可以导入、导出 `.motion.json`。
- 点击顶部“发布到客户端”会把当前动作标记为 `ready`，并将每种动作最近发布的
  `MotionProject` 生成到共享核心。Web 和小程序下次构建时会直接使用这些关键帧。

也可以从仓库根目录重新生成全部已发布动作：

```bash
pnpm motion:publish
```

## 创建健身数据 Skill

仓库内置 [`skills/create-fitness-motion/SKILL.md`](skills/create-fitness-motion/SKILL.md)，用于通过 Admin API 创建一条健身动作数据。快速调用脚本：

```bash
node apps/admin/skills/create-fitness-motion/scripts/create_motion.mjs \
  --name "深蹲节奏训练" \
  --exercise squat \
  --duration 2800
```

脚本返回动作 ID 和可直接打开的编辑地址；也支持用 `--project /absolute/path/action.motion.json` 导入完整项目。

## 当前角色素材限制

现有哈士奇素材仍是每个动作两张完整位图，因此角色本身会在姿势 A/B 间切换；
骨骼和角度已经在 Web、小程序和 Admin 中统一按多关键帧平滑补间。角色绘制现已
通过 `DemoCharacterRenderer` 与动作数据解耦，`MotionProject.character.renderer`
支持声明 `sprite-frames` 或 `layered-rig`。接入完整 2D 蒙皮仍需要美术侧提供头、
躯干、上下臂、手、大小腿、脚、尾巴和服装等透明图层素材。

## JSON 数据

导出文件使用 `schemaVersion: 1`，包含：

- 项目时长、循环与补间方式
- 哈士奇参考动作和显示选项
- 角色渲染器与素材 ID（旧项目缺少时自动按哈士奇精灵图处理）
- 所有关键帧的 33 个标准化姿态点
- 角度标注的三个关节、圆弧半径和标签偏移
- 当前启用的骨骼连线；最终 GIF 中不会绘制没有任何连线的孤立关节点

GIF 使用浏览器 Canvas 和项目内置 GIF89a 编码器在本机生成，不会上传素材或动作数据。
