
# 📌 Obsidian @QuickLink Plugin

Obsidian @QuickLink is a lightweight plugin that allows you to quickly link to other files in Obsidian notes using @ (or other custom symbols). It enhances the efficiency of note interlinking and reduces the need to manually type [[filename]].

⸻

✨ Key Features
	•	Quick linking with @ (or other symbols) 📎
	•	Type @ + a keyword from the file name, and the plugin will automatically suggest matching notes and insert [[link]].
	•	Smart note search 🔍
	•	Find relevant files using fuzzy matching without needing to type the full filename.
	•	Custom trigger symbol ⚙️
	•	Change the default @ trigger symbol to another character (such as #, !, /, etc.) in the plugin settings.

⸻

🛠️ Installation

Method 1: Manual Installation
	1.	Download the latest version of the @QuickLink plugin.
	2.	Place the .js, .css, and manifest.json files into the Obsidian plugins directory:

.obsidian/plugins/quicklink/


	3.	Enable the @QuickLink plugin in Obsidian Settings → Community Plugins.

Method 2: Obsidian Plugin Market (Upcoming)

🔜 Future support for installation via the Obsidian official plugin marketplace.

⸻

🚀 How to Use
	1.	Type @ (or your custom trigger symbol) to invoke the plugin:

Today's key task is @ProjectPlan

The plugin will automatically convert it to:

Today's key task is [[ProjectPlan]]


	2.	Select from multiple matching options:
	•	When you type @, the plugin will list all matching notes for selection.
	•	For example, typing @Plan may list:
	•	📄 Project Plan
	•	📄 Annual Plan
	•	📄 Travel Plan
	•	After selecting a file, it will automatically insert [[filename]].
	3.	Customize the trigger symbol:
	•	If you prefer not to use @, you can change the trigger symbol in the plugin settings.
	•	Possible alternatives: @ → # → / → ! → & (choose your favorite).
	•	For example, if you set # as the trigger symbol:

#ProjectPlan

It will also be converted to:

[[ProjectPlan]]



⸻

⚙️ Plugin Settings

The current version offers the following configurable options:
	•	Trigger Symbol 🎛️: Choose @ or another symbol (e.g., #, /, !).
	•	Matching Mode 🔍
	•	Strict Matching: Requires the full filename to be entered.
	•	Fuzzy Matching (Default): Matches files based on partial keywords.

⸻

🔧 Development Roadmap
	•	✅ Basic functionality: @ syntax automatically converts to [[file]].
	•	✅ Support for custom trigger symbols.
	•	🚀 Support for inserting #tag directly using @.
	•	🚀 Adaptation for the Obsidian official plugin marketplace.
	•	🚀 Performance optimization for large vaults.

⸻

💡 Contributions & Feedback

If you have suggestions for improving @QuickLink or find any bugs, feel free to submit an Issue or Pull Request!

📮 GitHub Repo: 🔗 https://github.com/Jamailar/QuickLink-Obsidian/
✉️ Contact Email: jamba971121@gmail.com

⸻


Obsidian @Link 是一个轻量级插件，允许你在 Obsidian 笔记中使用 @（或其他自定义符号）快速链接到其他文件，提升笔记间的互联效率，减少手动输入 [[文件名]] 的步骤。

✨ 主要功能
	•	使用 @（或其他符号）快速链接 📎
	  •	输入 @ + 文件名关键字，插件会自动建议匹配的笔记，并插入 [[链接]]。
	•	智能搜索笔记 🔍
	  •	通过模糊匹配查找相关文件，无需完整输入文件名。
	•	自定义触发符号 ⚙️
	  •	你可以在插件设置中更改 @ 为其他符号（如 #、!、/ 等）。
⸻

🛠️ 安装

方法 1：手动安装
	1.	下载最新版本的 @Link 插件 文件。
	2.	将 .js、.css 和 manifest.json 放入 Obsidian 的 plugins 目录：

.obsidian/plugins/at-link/


	3.	在 Obsidian 设置 → 社区插件 中启用 @Link 插件。

方法 2：通过 Obsidian 插件市场（待发布）

	🔜 未来支持 Obsidian 官方插件市场安装。

⸻

🚀 使用方式
	1.	输入 @ 符号（或自定义触发符号） 在笔记中调用插件：

今天的重点任务是 @项目计划

插件会自动转换为：

今天的重点任务是 [[项目计划]]


	2.	匹配多个候选项
	•	当输入 @ 后，插件会列出所有相关笔记供选择。
	•	例如，输入 @计划，会列出：
	•	📄 项目计划
	•	📄 年度计划
	•	📄 旅行计划
	•	选择目标文件后，自动插入 [[文件名]]。
	3.	自定义触发符号
	•	如果你不喜欢 @ 作为触发符号，可以在插件设置中修改：
	•	@ → # → / → ! → &（任选你喜欢的符号）
	•	例如，如果设置 # 作为触发符号：

#项目计划

也会转换为：

[[项目计划]]



⸻

⚙️ 插件设置

	目前版本 提供以下可配置选项：

	•	触发符号 🎛️ 选择 @ 或其他符号（如 #、/、!）。
	•	匹配模式 🔍
	•	严格匹配：必须输入完整文件名。
	•	模糊匹配（默认）：输入部分关键词即可匹配文件。

⸻

🔧 开发计划
	•	✅ 基础功能：@ 语法自动转换为 [[文件]]
	•	✅ 支持自定义触发符号
	•	🚀 支持 @ 直接插入标签 #tag
	•	🚀 适配 Obsidian 官方插件市场
	•	🚀 优化性能，支持超大笔记库

⸻

💡 贡献 & 反馈

如果你对 @Link 插件 有改进建议或发现 Bug，欢迎提交 Issue 或 PR！
📮 GitHub Repo：🔗 https://github.com/Jamailar/QuickLink-Obsidian/
✉️ 反馈邮箱：jamba971121@gmail.com


# 更新日志：
2025年3月8日
1、新增了排除文件夹的功能，防止模板文件和其他不需要的文件被检索到
1、新增了对Advanced URI插件的集成支持

感谢 @shoudeyunkaijianyueming 的建议

2025年3月10日
1、修改了对advanced uri插件uid的支持
2、增加了为所有没有uid的笔记增加uid的功能

