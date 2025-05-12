


# QuickLink

QuickLink 是一款用于 Obsidian 的插件，提供智能文件链接、自动扫描以及自定义补全规则功能。

QuickLink is a plugin for Obsidian that offers intelligent file linking, automatic scanning, and customizable suggestion triggers.

---

## 🧠 功能说明 Features

### 📌 文件智能补全 File Auto-Suggestion

- **默认触发符 @**：输入 `@` 后，会弹出文件建议列表，支持全局搜索（可设置排除文件夹）。
- **自定义触发规则**：你可以添加多个触发规则，每个规则包括：
  - 触发符号（如 `!`、`#` 等）
  - 限定的文件夹（仅这些目录中的文件参与匹配）
  - 正则过滤（只匹配符合命名规则的文件）
  - 标签过滤（只匹配含有指定标签的文件）

> **操作方式：**
> 在编辑器中输入触发字符，输入关键词，即可弹出对应建议，按 `Enter` 插入链接。按住 `Shift+Enter` 可添加别名。

> **How to use:**
> Type the trigger character in the editor and enter keywords to bring up suggestions. Press `Enter` to insert a link, or hold `Shift+Enter` to add an alias.

---

### 🗂 主体文件夹设定 Main Folders

- 设置“主体文件夹”后，补全建议和自动扫描功能只作用于这些路径下的文档。
- 支持多行输入（每行一个路径），每行在输入时会自动弹出路径建议，支持多层级文件夹。

- After setting "Main Folders", suggestions and auto scan will only apply to documents under these paths.
- Supports multi-line input (one path per line), with auto-complete suggestions for each line and multi-level folders.

---

### 🚫 排除文件夹 Excluded Folders

- 全局补全时会忽略这些文件夹。
- 也支持多行输入和路径提示。

- These folders will be ignored in global suggestions.
- Also supports multi-line input and path suggestions.

---

### 🧩 Advanced URI 支持 Advanced URI Support

- 开启后会生成 `obsidian://advanced-uri?...` 格式的链接。
- 可自定义用于生成链接的 frontmatter 字段名（如 `uid`、`custom_id` 等）。

- When enabled, links are generated in the `obsidian://advanced-uri?...` format.
- You can customize the frontmatter field used for link generation (e.g., `uid`, `custom_id`, etc.).

---

### 🔍 自动扫描 Auto Link Scan

- 在最左侧栏添加了 “Auto Link Scan” 图标按钮。
- 单击后，插件会自动扫描当前打开的文档内容，将所有文字中匹配“主体文件夹”下文件名的内容替换为链接。
- 支持普通链接或 Advanced URI 格式。

> **操作流程举例 Example workflow:**
> - 假设“主体文件夹”中有一个文件 `人际/张三.md`
> - 当前文档中出现了“张三”两个字
> - 扫描后会自动将其替换为 `[[张三]]` 或 `[张三](obsidian://advanced-uri?...uid=张三)` 的格式

> - Suppose there is a file `People/ZhangSan.md` in your "Main Folders".
> - If "ZhangSan" appears in the current document,
> - After scanning, it will be automatically replaced with `[[ZhangSan]]` or `[ZhangSan](obsidian://advanced-uri?...uid=ZhangSan)`.

---

### 🧠 Tag 标签匹配 Tag-based Filtering

- 每条自定义规则都可以设置标签过滤。
- 输入标签时支持自动提示 vault 中已存在的标签，输入时即可补全。

- Each custom rule can set tag-based filtering.
- Tag input supports auto-completion for existing tags in your vault.

---

## ⚙️ 设置入口 Settings Panel

插件设置包含 / The plugin settings include:

| 中文 | English | 说明 / Description |
|------|---------|-------------------|
| 启用补全 | Enable Suggestions | 开启或关闭建议补全功能 / Enable or disable suggestion completion |
| 全局触发字符 | Trigger Character | 默认使用 `@` 触发补全建议 / Default trigger for suggestions |
| 主体文件夹 | Main Folders | 限定参与补全与扫描的文件夹路径 / Folders for suggestions and scanning |
| 排除文件夹 | Exclude Folders | 全局排除不参与的文件夹 / Folders to exclude globally |
| 自定义规则 | Custom Rules | 每条规则包含：前缀、名称、包含文件夹、标签、正则过滤 / Each rule: prefix, name, folders, tags, regex |
| 开启 URI 模式 | Enable Advanced URI | 链接使用 advanced-uri 格式 / Use advanced-uri format for links |
| UID 字段名 | UID Field Name | 指定链接所依赖的字段名，默认为 `uid` / Field name used in links, default `uid` |

---

## ✨ 使用建议 Usage Tips

- 推荐配合 YAML frontmatter 的 UID 字段与 Advanced URI 插件使用，生成持久链接。
- 自定义多个触发前缀可以提升结构化笔记能力（如 `!人物`、`#地点`）。
- 可配合快捷键执行自动扫描，快速构建链接网络。

- It is recommended to use the UID field in YAML frontmatter and the Advanced URI plugin for persistent links.
- Defining multiple trigger prefixes (e.g., `!Person`, `#Place`) helps structure your notes.
- Use keyboard shortcuts to run auto scan and quickly build your link network.



# 💡 贡献 & 反馈

如果你对 @Link 插件 有改进建议或发现 Bug，欢迎提交 Issue 或 PR！

📮 GitHub Repo：🔗 https://github.com/Jamailar/QuickLink-Obsidian/

✉️ 反馈邮箱：jamba971121@gmail.com


# 更新日志：

### 2025年3月8日

1、新增了排除文件夹的功能，防止模板文件和其他不需要的文件被检索到

1、新增了对Advanced URI插件的集成支持

感谢 @shoudeyunkaijianyueming 的建议

### 2025年3月10日

1、修改了对advanced uri插件uid的支持

2、增加了为所有没有uid的笔记增加uid的功能

### 2025年5月12日

1、感谢B站网友daniellin84的建议，增加了自定义触发符号和规则的功能。
可以根据不同的符号匹配不同的规则

2、感谢B站up主 浪里小白龙7 的灵感，新增了批量创建链接的功能

3、增加了主体文件夹功能

4、增加了文件夹和标签的自动推荐功能，省区输入烦恼

5、增加了advanced uri插件集成状态下自定义uid字段名的功能
