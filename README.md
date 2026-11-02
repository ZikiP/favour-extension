# Favour — 网址收藏

一个 Chrome 扩展，把散落在浏览器里的网页收藏整理成可检索的资料库。

不用打开书签管理器翻文件夹：点一下图标就收下当前页面，标题、封面和结构化信息自动填好，之后在独立的管理页里搜索、筛选、补全。

**所有数据默认只保存在本机浏览器**，不上传任何服务器。

## 功能

- **一键收藏**：点工具栏图标或右键菜单，自动抓取标题、封面和页面上的结构化字段
- **管理页**：独立标签页，卡片视图、详情面板、分页、关键词搜索
- **整理**：标签、最爱、已看标记、集合视图、按人物或系列聚合
- **解析规则**：规则是纯 JSON，可为不同站点分别配置；同一个字段支持多条来源按顺序回退
- **重新刮削**：对已有条目重新跑一遍解析，补齐缺失字段
- **自动备份**：可指定本地文件夹，每天自动导出一次，失败 15 分钟后重试
- **可选同步**：把整份收藏推送到自建服务，供移动端读取（见下方「同步」）

## 安装

未上架商店，以开发者模式加载：

1. 下载或克隆本仓库
2. 打开 `chrome://extensions/`，右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择仓库根目录
4. 首次安装会自动打开管理页

需要 Chrome 111 或更高版本（用到 MV3 的 offscreen 文档）。

## 使用

### 收藏

在页面上点扩展图标即可。如果当前站点不在允许范围内，会跳到管理页并提示，可在「收藏范围」里把它加进白名单。

白名单写法：

| 写法 | 含义 |
| --- | --- |
| `example.com` | 该域名及其所有子域名 |
| `example.com/docs` | 仅该路径前缀 |
| `example.com:8080` | 指定端口 |
| `*` | 任意站点 |

### 去重

收藏时先按完整 URL 匹配已有条目；匹配不到时再尝试按解析出的编号字段匹配。所以同一部作品换个镜像地址再收一次，会更新原条目而不是新增一条。

### 管理页

- 左侧导航是分类，顶部是搜索框，右侧是卡片列表
- 点卡片打开详情，可编辑字段、切最爱、标记已看
- 「重新刮削」会用当前规则重新解析页面并合并字段

## 解析规则

规则文件放在 `rules/`，也可以在管理页的「解析规则」里粘贴 JSON 追加。用户规则优先于内置规则。

一条规则由 `matches`（生效范围）和 `fields`（要抓的字段）组成：

```json
{
  "schemaVersion": 1,
  "id": "example-site",
  "name": "Example",
  "version": "1.0.0",
  "matches": ["example.com"],
  "fields": [
    {
      "key": "code",
      "label": "编号",
      "sources": [
        { "type": "label", "rows": ".meta > div", "labels": ["编号", "Code"], "value": "text" },
        { "type": "meta", "property": "og:title", "regex": "^\\s*([A-Za-z0-9]+-\\d+)" },
        { "type": "url", "regex": "/([a-z0-9]+-\\d+)/?$", "upper": true }
      ]
    },
    {
      "key": "cover",
      "label": "封面",
      "sources": [
        { "type": "css", "selector": ".poster", "value": "backgroundImage" },
        { "type": "meta", "property": "og:image" }
      ]
    }
  ]
}
```

### 来源类型

| `type` | 取值位置 |
| --- | --- |
| `meta` | `<meta property="…">` 或 `<meta name="…">` 的 content |
| `label` | 键值对行，按标签文字匹配后取同行的值 |
| `css` | CSS 选择器，可取值 `text` / `attr` / `href` / `linkText` / `backgroundImage` |
| `url` | 当前页面地址 |
| `title` | 页面 `<title>` |
| `derive` | 引用同一条规则里已解析出的其他字段 |
| `constant` | 固定值 |

### 字段处理

- `regex` + `group`：从原文里抽取分组
- `regex` + `replace`：先测试匹配再替换
- `date`：把 `2024/1/5`、`2024年1月5日` 之类统一成 `2024-01-05`
- `upper` / `lower`：大小写转换

`title` 和 `cover` 是保留字段，会单独存；其余字段进入 `extras` 数组，在管理页和客户端按 `key` 展示。

`label` 类型支持多语言标签并存，站点改版时通常只需要补一条 `labels`。

## 同步（可选）

扩展可以把整份快照推送到自建服务，方便手机端或浏览器读取。默认不开启。

- 「同步设置」里可以配置多个目标（地址 + 访问令牌），最多 8 个
- 收藏变化后 1.2 秒防抖自动推送，也可手动点「立即同步」
- 「测试连接」只发 GET，不写入任何数据
- 每个目标独立显示成功/失败，互不影响

服务端只保存最新一份快照，不做版本历史，也不会回写扩展到本地。

## 备份

「备份设置」里选定一个本地文件夹（File System Access API），授权句柄存在 IndexedDB。

- 每天自动导出一次，条目变化不影响触发时间
- 失败后 15 分钟重试
- 导出文件是纯 JSON，可在「导入备份」里恢复

## 目录结构

```
manifest.json          扩展清单
background.js          Service Worker：收藏、菜单、通知、同步调度
background/
  phone-sync.js        推送与连接测试
  actress-avatars.js   按规则补全人物头像
  backup-schedule.js   每日备份定时
manager/               管理页
  manager.html
  manager.js           入口与事件绑定
  views.js             视图切换
  items.js             列表与分页
  pager.js             分页控件
  cards.js             卡片渲染
  detail.js            详情面板
  editor.js            字段编辑
  collections.js       集合视图
  actresses.js         人物视图
  sync.js              同步设置与状态
  backup.js            备份导入导出
  backup-settings.js   备份目录与周期
  scrape.js            重新刮削
  dialogs.js           通用弹窗
  list-tools.js        批量操作
  store.js             本地存储封装
  dom.js / meta.js / selectors.js / keys.js / actions.js
  styles/              样式
shared/                公共模块：字段提取引擎、白名单匹配、同步目标、备份句柄
rules/                 内置解析规则
icons/
tools/make-icons.mjs   生成图标
```

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` / `unlimitedStorage` | 保存收藏与规则，收藏量大时不至于写满配额 |
| `scripting` / `activeTab` | 在用户主动操作时注入解析脚本 |
| `tabs` | 读取当前标签页地址以完成收藏 |
| `contextMenus` / `notifications` | 右键收藏入口与保存提示 |
| `alarms` | 每日备份与同步重试 |
| `downloads` / `offscreen` | 导出备份文件 |
| `optional_host_permissions` | 按需申请访问范围，默认不预先索取 |

扩展不读取浏览历史，页面解析脚本只在你主动收藏或重新刮削时注入。

## 隐私与安全

- 收藏、规则、备份元数据都保存在 `chrome.storage.local`，扩展本身没有任何远端服务
- 只有在你配置了同步目标之后，数据才会以整份快照的形式发往你填写的地址
- 访问令牌以明文形式保存在 `chrome.storage`，与他人共用电脑时请注意
- 备份文件夹的访问权限由浏览器授予，可随时在管理页撤销

## 说明

本扩展只负责页面信息的整理与本地存储，不提供、不托管、不代理任何第三方内容。

请仅用于整理你有权访问的页面，并遵守所访问站点的服务条款与所在地法律。使用者需自行承担使用风险。
