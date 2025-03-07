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
        
        // 简化搜索逻辑，确保基本功能正常工作
        return files
            .filter(file => {
                // 如果查询为空，返回所有文件
                if (!query) return true;
                
                const fileName = file.basename.toLowerCase();
                const filePath = file.path.toLowerCase();
                
                // 简单包含匹配
                return fileName.includes(query.toLowerCase()) || filePath.includes(query.toLowerCase());
            })
            .sort((a, b) => {
                // 如果查询为空，按最近修改时间排序
                if (!query) {
                    return b.stat.mtime - a.stat.mtime;
                }
                
                const aName = a.basename.toLowerCase();
                const bName = b.basename.toLowerCase();
                const query_lower = query.toLowerCase();
                
                // 优先显示以查询开头的文件
                const aStartsWith = aName.startsWith(query_lower);
                const bStartsWith = bName.startsWith(query_lower);
                
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                
                // 然后按字母顺序排序
                return aName.localeCompare(bName);
            })
            .slice(0, 50) // 限制结果数量
            .map(file => ({
                label: file.basename,
                file: file,
                path: file.path
            }));
    }

    renderSuggestion(suggestion, el) {
        el.setText(suggestion.label);
        
        // 添加文件路径作为提示
        if (suggestion.path) {
            // 显示相对路径，不包括文件名本身
            const pathParts = suggestion.path.split('/');
            pathParts.pop(); // 移除文件名
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
        
        // 处理文件链接，使用文件名而不是完整路径
        let fileName = suggestion.file.basename;
        let linkText = generateMarkdownLink(this.app, fileName, includeAlias ? this.context.query : undefined);
        editor.replaceRange(linkText, this.context.start, this.context.end);
    }
    
    onTrigger(cursor, editor, file) {
        if (!this.plugin.settings.isAutosuggestEnabled) {
            return null;
        }
        
        const triggerPhrase = this.plugin.settings.autocompleteTriggerPhrase;
        
        // 获取当前行的文本
        const line = editor.getLine(cursor.line);
        
        // 查找当前行中最后一个触发符号的位置
        const lastTriggerIndex = line.lastIndexOf(triggerPhrase, cursor.ch);
        
        // 如果没有找到触发符号或者触发符号在光标之后，则不触发
        if (lastTriggerIndex === -1 || lastTriggerIndex >= cursor.ch) {
            return null;
        }
        
        // 检查触发符号前面的字符，确保不是字母、数字或反引号
        if (lastTriggerIndex > 0) {
            const precedingChar = line.charAt(lastTriggerIndex - 1);
            if (/[a-zA-Z0-9`]/.test(precedingChar)) {
                return null;
            }
        }
        
        // 设置开始位置为触发符号的位置
        const startPos = {
            line: cursor.line,
            ch: lastTriggerIndex
        };
        
        // 获取查询文本（触发符号后面的文本）
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