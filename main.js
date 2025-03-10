'use strict';

var require$$0$1 = require('obsidian');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var require$$0__default = /*#__PURE__*/_interopDefaultLegacy(require$$0$1);

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

// 修改后的 generateMarkdownLink 函数：现在接收 file 对象和 plugin 实例
function generateMarkdownLink(app, file, alias, plugin) {
    return __awaiter(this, void 0, void 0, function* () {
        // 获取文件相对路径，移除 .md 后缀
        let filePath = file.path;
        if (filePath.endsWith('.md')) {
            filePath = filePath.substring(0, filePath.length - 3);
        }
        // 使用文件的 basename 作为显示名称
        const fileName = file.basename;
        
        // 添加调试日志，观察 Advanced URI 插件状态
        console.log("Advanced URI integration setting:", plugin.settings.enableAdvancedUri);
        console.log("App plugins:", Object.keys(app.plugins.plugins));
        console.log("Advanced URI plugin:", app.plugins.plugins["obsidian-advanced-uri"]);
        
        // 如果在设置中打开了 Advanced URI 集成，并且插件存在，则生成 Advanced URI 格式链接
        if (plugin.settings.enableAdvancedUri && app.plugins.plugins["obsidian-advanced-uri"]) {
            const vaultName = app.vault.getName();
            
            // 尝试从文件内容中获取 UID
            let uid = null;
            try {
                // 读取文件内容
                const fileContent = yield app.vault.read(file);
                
                // 尝试从 YAML frontmatter 中提取 UID
                const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
                if (frontmatterMatch) {
                    const frontmatter = frontmatterMatch[1];
                    const uidMatch = frontmatter.match(/uid:\s*([^\s\n]+)/);
                    if (uidMatch) {
                        uid = uidMatch[1];
                    }
                }
                
                // 如果 frontmatter 中没有 UID，尝试查找内联 UID
                if (!uid) {
                    const inlineUidMatch = fileContent.match(/\nuid:\s*([^\s\n]+)/);
                    if (inlineUidMatch) {
                        uid = inlineUidMatch[1];
                    }
                }
            } catch (error) {
                console.error("Error reading file for UID:", error);
            }
            
            // 根据是否找到 UID 生成不同的链接
            let advancedUri;
            if (uid) {
                // 使用 UID 生成链接
                advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&uid=${encodeURIComponent(uid)}`;
            } else {
                // 如果没有 UID，回退到使用文件路径
                advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`;
            }
            
            if (alias) {
                return `[${alias}](${advancedUri})`;
            } else {
                return `[${fileName}](${advancedUri})`;
            }
        }
        
        // 如果未启用 Advanced URI，则使用原有逻辑生成链接
        const useMarkdownLinks = app.vault.getConfig("useMarkdownLinks");
        if (useMarkdownLinks) {
            if (alias) {
                return `[${alias}](${fileName})`;
            } else {
                return `[${fileName}](${fileName})`;
            }
        } else {
            if (alias) {
                return `[[${fileName}|${alias}]]`;
            } else {
                return `[[${fileName}]]`;
            }
        }
    });
}

// 默认设置
const DEFAULT_SETTINGS = {
    autocompleteTriggerPhrase: "@",
    isAutosuggestEnabled: true,
    excludeFolders: [],
    // 新增：Advanced URI 集成开关，默认关闭
    enableAdvancedUri: false
};

// 设置选项卡，新增 Advanced URI 集成设置
class SettingsTab extends require$$0$1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display() {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl("h2", {
            text: "Quick File Linker / 快速文件链接",
        });
        
        new require$$0$1.Setting(containerEl)
            .setName("Enable file suggestions / 启用文件自动建议")
            .setDesc(`Input ${this.plugin.settings.autocompleteTriggerPhrase} to trigger file suggestions / 输入 ${this.plugin.settings.autocompleteTriggerPhrase} 触发文件建议`)
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.isAutosuggestEnabled)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.isAutosuggestEnabled = value;
                    yield this.plugin.saveSettings();
                })));
        
        new require$$0$1.Setting(containerEl)
            .setName("Trigger character / 触发字符")
            .setDesc("Character that will trigger file suggestions / 输入此字符后将触发文件建议")
            .addText((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.autocompleteTriggerPhrase)
                .setValue(this.plugin.settings.autocompleteTriggerPhrase || "@")
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.autocompleteTriggerPhrase = value.trim();
                    yield this.plugin.saveSettings();
                })));
        
        new require$$0$1.Setting(containerEl)
            .setName("Exclude folders / 排除文件夹")
            .setDesc("Folders to exclude from search (one per line) / 搜索时排除的文件夹（每行一个）")
            .addTextArea((text) => text
                .setPlaceholder("folder1\nfolder2/subfolder")
                .setValue(this.plugin.settings.excludeFolders ? this.plugin.settings.excludeFolders.join("\n") : "")
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.excludeFolders = value
                        .split("\n")
                        .map(folder => folder.trim())
                        .filter(folder => folder.length > 0);
                    yield this.plugin.saveSettings();
                })));
                
        // 新增：Advanced URI 集成开关设置
        new require$$0$1.Setting(containerEl)
            .setName("Enable Advanced URI integration / 启用 Advanced URI 集成")
            .setDesc("If installed, new links will be generated in Advanced URI format / 如果安装了 Advanced URI 插件，新建链接将使用其格式")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAdvancedUri)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.enableAdvancedUri = value;
                    yield this.plugin.saveSettings();
                })));
        
        // 新增：批量生成 UID 功能
        containerEl.createEl("h3", {
            text: "UID Management / UID 管理",
        });
        
        new require$$0$1.Setting(containerEl)
            .setName("Generate UIDs for all files / 为所有文件生成 UID")
            .setDesc("Add a unique identifier (UID) to all files that don't have one / 为所有没有 UID 的文件添加唯一标识符")
            .addButton(button => button
                .setButtonText("Generate UIDs / 生成 UID")
                .onClick(() => __awaiter(this, void 0, void 0, function* () {
                    // 显示确认对话框
                    const confirmModal = new require$$0$1.Modal(this.app);
                    confirmModal.titleEl.setText("确认生成 UID");
                    confirmModal.contentEl.setText("此操作将为所有没有 UID 的文件添加 UID。这将修改文件内容，确定要继续吗？");
                    
                    // 添加确认和取消按钮
                    const buttonContainer = confirmModal.contentEl.createDiv();
                    buttonContainer.addClass("modal-button-container");
                    
                    const cancelButton = buttonContainer.createEl("button", { text: "取消" });
                    cancelButton.addEventListener("click", () => {
                        confirmModal.close();
                    });
                    
                    const confirmButton = buttonContainer.createEl("button", { text: "确认" });
                    confirmButton.addClass("mod-cta");
                    confirmButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
                        confirmModal.close();
                        yield this.plugin.generateUIDsForAllFiles();
                    }));
                    
                    confirmModal.open();
                })));
    }
}

// 文件建议类
class FileSuggest extends require$$0$1.EditorSuggest {
    constructor(app, plugin) {
        super(app);
        this.app = app;
        this.plugin = plugin;
        // @ts-ignore
        this.scope.register(["Shift"], "Enter", (evt) => {
            // @ts-ignore
            this.suggestions.useSelectedItem(evt);
            return false;
        });
    }
    
    getSuggestions(context) {
        return this.getFileSuggestions(context.query.toLowerCase());
    }
    
    getFileSuggestions(query) {
        const files = this.app.vault.getMarkdownFiles();
        const excludeFolders = this.plugin.settings.excludeFolders || [];
        return files
            .filter(file => {
                const isExcluded = excludeFolders.some(folder => {
                    const folderPath = folder.endsWith('/') ? folder : folder + '/';
                    return file.path.startsWith(folderPath) || file.path === folder;
                });
                if (isExcluded) return false;
                if (!query) return true;
                const fileName = file.basename.toLowerCase();
                const filePath = file.path.toLowerCase();
                return fileName.includes(query.toLowerCase()) || filePath.includes(query.toLowerCase());
            })
            .sort((a, b) => {
                if (!query) {
                    return b.stat.mtime - a.stat.mtime;
                }
                const aName = a.basename.toLowerCase();
                const bName = b.basename.toLowerCase();
                const query_lower = query.toLowerCase();
                const aStartsWith = aName.startsWith(query_lower);
                const bStartsWith = bName.startsWith(query_lower);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return aName.localeCompare(bName);
            })
            .slice(0, 50)
            .map(file => ({
                label: file.basename,
                file: file,
                path: file.path
            }));
    }

    renderSuggestion(suggestion, el) {
        el.setText(suggestion.label);
        if (suggestion.path) {
            const pathParts = suggestion.path.split('/');
            pathParts.pop();
            const pathText = pathParts.join('/');
            el.createSpan({
                cls: "suggestion-note",
                text: pathText ? ` (${pathText})` : " (文件)"
            });
        } else {
            el.createSpan({
                cls: "suggestion-note",
                text: " (文件)"
            });
        }
    }
    
    selectSuggestion(suggestion, event) {
        return __awaiter(this, void 0, void 0, function* () {
            const { editor } = this.context;
            const includeAlias = event.shiftKey;
            // 等待链接生成
            let linkText = yield generateMarkdownLink(this.app, suggestion.file, includeAlias ? this.context.query : undefined, this.plugin);
            editor.replaceRange(linkText, this.context.start, this.context.end);
        });
    }
    
    onTrigger(cursor, editor, file) {
        if (!this.plugin.settings.isAutosuggestEnabled) {
            return null;
        }
        
        const triggerPhrase = this.plugin.settings.autocompleteTriggerPhrase;
        const line = editor.getLine(cursor.line);
        const lastTriggerIndex = line.lastIndexOf(triggerPhrase, cursor.ch);
        if (lastTriggerIndex === -1 || lastTriggerIndex >= cursor.ch) {
            return null;
        }
        if (lastTriggerIndex > 0) {
            const precedingChar = line.charAt(lastTriggerIndex - 1);
            if (/[a-zA-Z0-9`]/.test(precedingChar)) {
                return null;
            }
        }
        const startPos = {
            line: cursor.line,
            ch: lastTriggerIndex
        };
        const query = line.substring(lastTriggerIndex + triggerPhrase.length, cursor.ch);
        return {
            start: startPos,
            end: cursor,
            query: query
        };
    }
}

// 主插件类
class QuickFileLinkPlugin extends require$$0$1.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.addSettingTab(new SettingsTab(this.app, this));
            this.registerEditorSuggest(new FileSuggest(this.app, this));
        });
    }
    
    onunload() {
        console.log("Unloading quick file link plugin");
    }
    
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    
    // 新增：为所有文件生成 UID 的方法
    generateUIDsForAllFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            // 创建进度条通知
            const statusBarItem = this.addStatusBarItem();
            statusBarItem.setText("正在生成 UID...");
            
            // 获取所有 markdown 文件
            const files = this.app.vault.getMarkdownFiles();
            let processedCount = 0;
            let addedCount = 0;
            
            // 创建通知
            const notice = new require$$0$1.Notice("开始生成 UID...", 0);
            
            try {
                for (const file of files) {
                    // 更新进度条
                    processedCount++;
                    statusBarItem.setText(`正在生成 UID... (${processedCount}/${files.length})`);
                    
                    // 读取文件内容
                    const content = yield this.app.vault.read(file);
                    
                    // 检查文件是否已有 UID
                    const hasUID = this.checkFileHasUID(content);
                    
                    if (!hasUID) {
                        // 生成新的 UID
                        const newUID = this.generateUID();
                        
                        // 将 UID 添加到文件中
                        const newContent = this.addUIDToFile(content, newUID);
                        
                        // 写入文件
                        yield this.app.vault.modify(file, newContent);
                        
                        addedCount++;
                    }
                }
                
                // 更新通知
                notice.setMessage(`UID 生成完成！已为 ${addedCount} 个文件添加 UID。`);
                setTimeout(() => {
                    notice.hide();
                }, 5000);
            } catch (error) {
                console.error("生成 UID 时出错:", error);
                new require$$0$1.Notice("生成 UID 时出错: " + error.message);
            } finally {
                // 移除进度条
                statusBarItem.remove();
            }
        });
    }
    
    // 检查文件是否已有 UID
    checkFileHasUID(content) {
        // 检查 YAML frontmatter 中是否有 UID
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            if (frontmatter.match(/uid:\s*([^\s\n]+)/)) {
                return true;
            }
        }
        
        // 检查内联 UID
        if (content.match(/\nuid:\s*([^\s\n]+)/)) {
            return true;
        }
        
        return false;
    }
    
    // 生成唯一的 UID
    generateUID() {
        // 生成一个基于时间戳和随机数的 UID
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 7);
        return `${timestamp}-${randomPart}`;
    }
    
    // 将 UID 添加到文件中
    addUIDToFile(content, uid) {
        // 检查文件是否有 YAML frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            // 在 frontmatter 中添加 UID
            const frontmatter = frontmatterMatch[1];
            const updatedFrontmatter = frontmatter + `\nuid: ${uid}`;
            return content.replace(frontmatterMatch[0], `---\n${updatedFrontmatter}\n---`);
        } else {
            // 如果没有 frontmatter，则创建一个
            return `---\nuid: ${uid}\n---\n\n${content}`;
        }
    }
}

module.exports = QuickFileLinkPlugin;