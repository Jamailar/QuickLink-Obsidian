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

// 生成Markdown链接
function generateMarkdownLink(app, subpath, alias) {
    const useMarkdownLinks = app.vault.getConfig("useMarkdownLinks");
    
    // 移除 .md 后缀
    let displayPath = subpath;
    if (displayPath.endsWith('.md')) {
        displayPath = displayPath.substring(0, displayPath.length - 3);
    }
    
    // 移除相对路径，只保留文件名
    const fileName = displayPath.split('/').pop();
    
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
    isAutosuggestEnabled: true
};

// 设置选项卡
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
        // 获取文件建议
        return this.getFileSuggestions(context.query.toLowerCase());
    }
    
    getFileSuggestions(query) {
        // 获取所有markdown文件
        const files = this.app.vault.getMarkdownFiles();
        
        // 过滤并排序匹配的文件
        return files
            .filter(file => {
                const fileName = file.basename.toLowerCase();
                return fileName.includes(query);
            })
            .sort((a, b) => {
                // 优先显示以查询开头的文件
                const aName = a.basename.toLowerCase();
                const bName = b.basename.toLowerCase();
                const aStartsWith = aName.startsWith(query);
                const bStartsWith = bName.startsWith(query);
                
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                
                // 然后按字母顺序排序
                return aName.localeCompare(bName);
            })
            .slice(0, 10) // 限制结果数量
            .map(file => ({
                label: file.basename,
                file: file
            }));
    }

    renderSuggestion(suggestion, el) {
        el.setText(suggestion.label);
        el.createSpan({
            cls: "suggestion-note",
            text: " (File/文件)"
        });
    }
    
    selectSuggestion(suggestion, event) {
        const { editor } = this.context;
        const includeAlias = event.shiftKey;
        
        // 处理文件链接，使用文件名而不是完整路径
        let fileName = suggestion.file.basename;
        let linkText = generateMarkdownLink(this.app, fileName, includeAlias ? this.context.query : undefined);
        editor.replaceRange(linkText, this.context.start, this.context.end);
    }
    
    onTrigger(cursor, editor, file) {
        var _a;
        if (!this.plugin.settings.isAutosuggestEnabled) {
            return null;
        }
        const triggerPhrase = this.plugin.settings.autocompleteTriggerPhrase;
        const startPos = ((_a = this.context) === null || _a === void 0 ? void 0 : _a.start) || {
            line: cursor.line,
            ch: cursor.ch - triggerPhrase.length,
        };
        if (!editor.getRange(startPos, cursor).startsWith(triggerPhrase)) {
            return null;
        }
        const precedingChar = editor.getRange({
            line: startPos.line,
            ch: startPos.ch - 1,
        }, startPos);
        // Short-circuit if `@` as a part of a word (e.g. part of an email address)
        if (precedingChar && /[`a-zA-Z0-9]/.test(precedingChar)) {
            return null;
        }
        return {
            start: startPos,
            end: cursor,
            query: editor.getRange(startPos, cursor).substring(triggerPhrase.length),
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