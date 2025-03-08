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
        const advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`;
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
        const { editor } = this.context;
        const includeAlias = event.shiftKey;
        // 调用新版 generateMarkdownLink，传入完整文件对象和 plugin 实例
        let linkText = generateMarkdownLink(this.app, suggestion.file, includeAlias ? this.context.query : undefined, this.plugin);
        editor.replaceRange(linkText, this.context.start, this.context.end);
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
}

module.exports = QuickFileLinkPlugin;