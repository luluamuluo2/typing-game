# 生死时速 / Speed Chase

金山打字通经典游戏「生死时速」的网页致敬版。在等距卡通城市中，通过看中文、输入拼音控制警察或小偷移动：打得越快，角色跑得越快，并会从步行升级到自行车或汽车。

**在线试玩：[https://typingchase.com](https://typingchase.com)**

## 游戏截图

### 选择角色、载具和练习文章

![选择角色、载具和练习文章](docs/screenshots/setup.png)

### 输入文字控制追逐速度

![输入文字控制追逐速度](docs/screenshots/gameplay.png)

### 对局结果和段位

![对局结果和段位](docs/screenshots/result.png)

## 游戏特色

- 两种身份：扮演警察追捕小偷，或者扮演小偷完成文章并逃脱。
- 三种移动方式：步行、自行车和汽车，输入速度越高，移动速度越快。
- 默认中文拼音模式：粘贴自己的完整中文句子，自动生成无声调拼音。
- 中文原文逐字高亮，拼音提示可以显示或隐藏；也保留英文原文练习模式。
- 转换在浏览器本地完成，不会把自定义句子发送到拼音 API。
- 实时统计速度、准确率、用时和错键数。
- 青铜、白银、黄金、钻石、王者五级对局段位。
- 保存个人最佳成绩，并在打破纪录时显示提示。
- 生成竖版战报海报，可保存或复制分享。
- 支持中文和英文界面。
- 首次进入时预加载地图和角色资源，慢速网络下不会在开局后等待图片。

## 游戏规则

1. 选择警察或小偷，以及双方使用的载具。
2. 选择中文拼音或英文模式，选择示例，也可以粘贴自己的句子（1–2000 字符）。自定义内容无效时会提示，不会偷偷切回示例。
3. 中文模式：切到英文输入法，按原文连续输入小写拼音，不打声调、空格或标点，`ü` 用 `v`。例如「你好，世界！」输入 `nihaoshijie`。夹杂的英文字母转小写，数字原样输入。
   英文模式：按照原文输入，大小写、空格和标点必须匹配。
   多音字采用词库结合上下文自动选择的读音，以显示的拼音为准；不支持的生僻字、表情和其他语言字符会提示替换。
4. 连续快速输入会提升移动速度；打错或停顿会让角色减速。
5. 警察需要在文章结束前抓住小偷，小偷需要在被抓前完成全文。

游戏过程中按 `Esc` 可以退出当前对局。URL 加上 `?debug=1` 可以显示道路中心线，方便开发时调试路径。

## 技术栈

- TypeScript
- Vite
- Canvas 2D
- Web Audio API
- Cloudflare Workers Static Assets

## 本地开发

环境要求：Node.js 22.12 或更高版本。

```bash
npm ci
npm run dev
```

打开终端输出的本地地址即可开始游戏。

生产构建：

```bash
npm run build
```

使用 Cloudflare 本地运行环境预览：

```bash
npm run dev:cf
```

## 验证

```bash
npm test
npm run build
```

`npm test` 覆盖拼音转换、上下文多音字、`ü`、输入校验、原文与按键进度映射、英文回归和输入法事件。浏览器中可检查：自定义短句、隐藏/显示提示、输错后继续、Esc 退出、再来一局、模式切换以及战报分享。

本分支保持单人电脑对手玩法；仓库中没有多人房间、实时联机服务器或 WebSocket 功能。

## 部署到 Cloudflare Workers

项目通过 `wrangler.jsonc` 配置 Cloudflare Workers Static Assets，构建产物位于 `dist`。首次部署前登录 Cloudflare：

```bash
npx wrangler login
```

构建并部署：

```bash
npm run deploy
```

当前配置会将 Worker 绑定到 [typingchase.com](https://typingchase.com)。如需使用其他域名，请修改 `wrangler.jsonc` 中的 `routes`。

### Cloudflare Git 自动部署

在 Cloudflare 控制台导入仓库并使用以下构建配置：

- Build command：`npm run build`
- Deploy command：`npx wrangler deploy`
- Root directory：`/`

Cloudflare 会根据仓库中的 `wrangler.jsonc` 上传 `dist` 静态资源。

## 项目结构

```text
public/             静态图片、图标和音频
src/                游戏逻辑、界面、音频和国际化代码
docs/screenshots/   README 游戏截图
index.html          页面结构与 SEO 信息
wrangler.jsonc      Cloudflare Workers 部署配置
```

## 说明

本项目是对经典打字游戏玩法的网页致敬实现，用于学习和交流。
