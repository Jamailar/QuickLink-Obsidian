import { App, Plugin, PluginSettingTab, Setting, Notice, EditorSuggest, TFile, EditorSuggestContext, EditorPosition, Editor, SuggestModal, TextAreaComponent, MarkdownView, normalizePath, getAllTags, FileManager, HeadingCache, TFolder } from 'obsidian';

/** 单个触发规则定义 */
interface TriggerFilterRule {
  prefix: string;                // 前缀字符，如 'n'
  name: string;                  // 规则名称，用于 UI 显示
  includeFolders: string[];      // 仅在这些文件夹中搜索
  nameFilterRegex: string;       // 对文件名的正则过滤
  includeTags: string[];         // 仅在包含这些标签的文件中搜索
}

// 更新插件设置类型
interface QuickLinkSettings {
  autocompleteTriggerPhrase: string;
  isAutosuggestEnabled: boolean;
  excludeFolders: string[];
  enableAdvancedUri: boolean;
  triggerFilterRules: TriggerFilterRule[];
  mainPaths: string[]; // 全局符号的限定文件夹列表
  advancedUriField: string; // Frontmatter field name for UID
}

// 更新默认设置
const DEFAULT_SETTINGS: QuickLinkSettings = {
  autocompleteTriggerPhrase: '@',
  isAutosuggestEnabled: true,
  excludeFolders: [],
  enableAdvancedUri: false,
  triggerFilterRules: [],
  mainPaths: [],
  advancedUriField: 'uid',
};

/** FolderSuggestModal for inline folder suggestions */
class FolderSuggestModal extends SuggestModal<string> {
  onChooseSuggestion: (suggestion: string) => void;

  constructor(app: App, onChooseSuggestion: (suggestion: string) => void) {
    super(app);
    this.onChooseSuggestion = onChooseSuggestion;
  }

  getSuggestions(query: string): string[] {
    const folders = this.app.vault.getAllLoadedFiles()
      .filter(f => f instanceof TFile === false) // folders only
      .map(f => f.path)
      .filter((v, i, a) => a.indexOf(v) === i); // unique
    return folders.filter(folder => folder.toLowerCase().contains(query.toLowerCase()));
  }

  renderSuggestion(suggestion: string, el: HTMLElement): void {
    el.setText(suggestion);
  }

  onChooseSuggestionItem(suggestion: string, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseSuggestion(suggestion);
  }
}

/** 生成 Markdown 链接 */
async function generateMarkdownLink(
  app: App,
  file: TFile,
  sourcePath: string,
  alias: string | undefined,
  plugin: QuickLinkPlugin
): Promise<string> {
  // 文件路径与名称处理
  const fileName = file.basename;

  // Advanced URI 逻辑
  if (plugin.settings.enableAdvancedUri) {
    // 尝试使用 Advanced URI，如果失败则回退到普通链接
    const vaultName = app.vault.getName();
    const fieldName = plugin.settings.advancedUriField;
    let uid: string | null = null;
    const fileCache = app.metadataCache.getFileCache(file);
    if (fileCache?.frontmatter && fieldName in fileCache.frontmatter) {
      uid = fileCache.frontmatter[fieldName];
    }

    if (!uid) {
        try {
            const content = await app.vault.read(file);
            const inline = content.match(new RegExp(`\\n${fieldName}:\\s*([^\\s\\n]+)`));
            if (inline) uid = inline[1];
        } catch {}
    }

    let advancedUri: string;
    if (uid) {
      const param = encodeURIComponent(fieldName);
      advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&${param}=${encodeURIComponent(uid)}`;
    } else {
      advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(normalizePath(file.path))}`;
    }
    return alias ? `[${alias}](${advancedUri})` : `[${fileName}](${advancedUri})`;
  }

  // 普通链接逻辑
  return app.fileManager.generateMarkdownLink(file, sourcePath, undefined, alias);
}

/** Escape string for use in RegExp */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/** 设置面板 */
class SettingsTab extends PluginSettingTab {
  plugin: QuickLinkPlugin;
  constructor(app: App, plugin: QuickLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Enable suggestions / 启用建议')
      .setDesc(`Trigger on '${this.plugin.settings.autocompleteTriggerPhrase}' to suggest files / 使用 '${this.plugin.settings.autocompleteTriggerPhrase}' 触发文件建议`)
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.isAutosuggestEnabled)
          .onChange(async value => {
            this.plugin.settings.isAutosuggestEnabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.isAutosuggestEnabled) {
      new Setting(containerEl)
        .setName('Trigger character / 触发字符')
        .setDesc('Character that will trigger file suggestions / 触发文件建议的字符')
        .addText(text =>
          text
            .setValue(this.plugin.settings.autocompleteTriggerPhrase)
            .onChange(async value => {
              this.plugin.settings.autocompleteTriggerPhrase = value;
              await this.plugin.saveSettings();
            })
        );
    }


    const createFolderSuggest = (textArea: TextAreaComponent, setPaths: (paths: string[]) => void) => {
        const input = textArea.inputEl;
        input.parentElement?.addClass('quicklink-folder-input-container');
        let suggestEl: HTMLElement | null = null;
        let suggestions: string[] = [];
        let selectedIndex = 0;
        let isActive = false;
    
        const showSuggestions = () => {
            if (!suggestEl) {
                suggestEl = input.parentElement?.createDiv({ cls: 'quicklink-suggestion-container' }) || null;
            }
            if (!suggestEl || suggestions.length === 0) {
                hideSuggestions();
                return;
            }
            suggestEl.empty();
            suggestEl.addClass('is-active');
            isActive = true;
            suggestions.forEach((sug, i) => {
                const item = suggestEl!.createDiv({ cls: 'quicklink-suggestion-item', text: sug });
                if (i === selectedIndex) {
                    item.addClass('is-selected');
                }
                item.addEventListener('mousedown', async (e) => {
                    e.preventDefault();
                    await selectSuggestion(i);
                });
            });
        };
    
        const hideSuggestions = () => {
            if (suggestEl) {
                suggestEl.removeClass('is-active');
            }
            isActive = false;
            selectedIndex = 0;
        };
    
        const selectSuggestion = async (index: number) => {
            if (index < 0 || index >= suggestions.length) return;
    
            const selected = suggestions[index];
            const lines = input.value.split('\n');
            const { currentLineIndex } = getActiveLine(input);
    
            if (currentLineIndex === -1) {
                hideSuggestions();
                return;
            }
            
            lines[currentLineIndex] = selected;
            
            const newValue = lines.join('\n');
            
            const newPaths = lines.map(l => normalizePath(l.trim())).filter(Boolean);
            setPaths(newPaths);
            await this.plugin.saveSettings();
            
            input.value = newValue;
            
            let newCursorPos = 0;
            for (let i = 0; i < currentLineIndex; i++) {
                newCursorPos += lines[i].length + 1;
            }
            newCursorPos += lines[currentLineIndex].length;
            input.setSelectionRange(newCursorPos, newCursorPos);
    
            hideSuggestions();
        };
        
        const getActiveLine = (el: HTMLTextAreaElement): { currentLineIndex: number, currentLine: string } => {
            const lines = el.value.split('\n');
            const cursorPos = el.selectionStart || 0;
            let charCount = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineEnd = charCount + lines[i].length;
                if (cursorPos >= charCount && cursorPos <= lineEnd + 1) {
                    return { currentLineIndex: i, currentLine: lines[i] };
                }
                charCount += lines[i].length + 1;
            }
            return { currentLineIndex: -1, currentLine: '' };
        };
    
        const updateSuggestions = () => {
            const { currentLine } = getActiveLine(input);
            const lowerCurrentLine = currentLine.toLowerCase();

            const lastSlashIndex = lowerCurrentLine.lastIndexOf('/');
            const basePath = lastSlashIndex === -1 ? '' : lowerCurrentLine.substring(0, lastSlashIndex + 1);
            const searchFragment = lowerCurrentLine.substring(lastSlashIndex + 1);

            const allFolders = this.app.vault.getAllLoadedFiles()
                .filter((f): f is TFolder => f instanceof TFolder && f.path !== '/')
                .map(f => f.path);
            
            const children = new Set<string>();
            for (const folder of allFolders) {
                const lowerFolder = folder.toLowerCase();
                if (basePath === '' && !lowerFolder.includes('/')) {
                    children.add(folder);
                } else if (basePath !== '' && lowerFolder.startsWith(basePath) && lowerFolder.length > basePath.length) {
                    const remainder = folder.substring(basePath.length);
                    const nextSlash = remainder.indexOf('/');
                    const childName = nextSlash === -1 ? remainder : remainder.substring(0, nextSlash);
                    children.add(basePath + childName);
                }
            }

            suggestions = Array.from(children)
                .filter(child => child.toLowerCase().substring(lastSlashIndex + 1).includes(searchFragment))
                .sort()
                .slice(0, 10);
            
            if (suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].toLowerCase() === lowerCurrentLine.trim())) {
                 selectedIndex = 0;
                 showSuggestions();
            } else {
                 hideSuggestions();
            }
        };
    
        input.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (!isActive) return;
    
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                showSuggestions();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
                showSuggestions();
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                await selectSuggestion(selectedIndex);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideSuggestions();
            }
        });
    
        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => {
            setTimeout(() => {
                hideSuggestions();
            }, 150);
        });
    };

    new Setting(containerEl)
      .setName('Main folders / 主体文件夹')
      .setDesc(
        'Set these folders for auto-linking. When using the global trigger, search will be limited to these folders (leave empty for global search).\n设置该文件夹用于自动扫描文档进行自动连接创建。使用全局触发符时，仅在这些文件夹中搜索（留空表示全局）。'
      )
      .addTextArea(
        text => {
            text.setValue(this.plugin.settings.mainPaths.join('\n'));
            createFolderSuggest(text, 
                (paths) => this.plugin.settings.mainPaths = paths
            );
            text.inputEl.addEventListener('blur', async () => {
                const lines = text.inputEl.value.split('\n').map(s => normalizePath(s.trim())).filter(Boolean);
                this.plugin.settings.mainPaths = lines;
                await this.plugin.saveSettings();
            });
        }
      );

    new Setting(containerEl)
      .setName('Exclude folders / 排除文件夹')
      .setDesc('Folders to exclude from search (one per line) / 排除搜索的文件夹（每行一个）')
      .addTextArea(text => {
        text.setValue(this.plugin.settings.excludeFolders.join('\n'));
        createFolderSuggest(text,
            (paths) => this.plugin.settings.excludeFolders = paths
        );
        text.inputEl.addEventListener('blur', async () => {
            const lines = text.inputEl.value.split('\n').map(s => normalizePath(s.trim())).filter(Boolean);
            this.plugin.settings.excludeFolders = lines;
            await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
        .setName('Enable advanced URI integration / 启用高级 URI 集成')
        .setDesc('Requires the "Advanced URI" plugin. / 需要 "Advanced URI" 插件。')
        .addToggle(toggle =>
            toggle
                .setValue(this.plugin.settings.enableAdvancedUri)
                .onChange(async value => {
                    this.plugin.settings.enableAdvancedUri = value;
                    await this.plugin.saveSettings();
                    this.display(); // Rerender to show/hide the UID field
                })
        );

    if (this.plugin.settings.enableAdvancedUri) {
        new Setting(containerEl)
            .setName('UID field name / UID 字段名')
            .setDesc('The frontmatter field name for the unique ID. / 用于高级 URI 的前置元数据字段名。')
            .addText(text =>
                text
                    .setValue(this.plugin.settings.advancedUriField)
                    .onChange(async value => {
                        this.plugin.settings.advancedUriField = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
    
    new Setting(containerEl).setName('Custom rules / 自定义规则').setHeading();

    this.plugin.settings.triggerFilterRules.forEach((rule, index) => {
        const details = containerEl.createEl('details');
        details.addClass('quicklink-rule-panel');

        const summary = details.createEl('summary');
        summary.addClass('quicklink-rule-summary');
        summary.setText(`Rule ${index + 1}: ${rule.name || 'New Rule'}`);
        
        const ruleContainer = details.createDiv();

        new Setting(ruleContainer)
            .setName('Rule name / 规则名称')
            .addText(text => {
                text.setPlaceholder('Rule Name')
                    .setValue(rule.name)
                    .onChange(async (value) => {
                    rule.name = value;
                    await this.plugin.saveSettings();
                    summary.setText(`Rule ${index + 1}: ${rule.name || 'New Rule'}`);
                    });
            });

        new Setting(ruleContainer)
            .setName('Prefix / 前缀')
            .addText(text => {
                text.setPlaceholder('Prefix')
                    .setValue(rule.prefix)
                    .onChange(async (value) => {
                    rule.prefix = value;
                    await this.plugin.saveSettings();
                    });
            });

      new Setting(ruleContainer)
        .setName('Include folders / 包含文件夹')
        .setDesc('One folder per line / 每行一个文件夹')
        .addTextArea(text => {
          text.setValue(rule.includeFolders.join('\n'));
          createFolderSuggest(text,
            (paths) => rule.includeFolders = paths
          );
          text.inputEl.addEventListener('blur', async () => {
            const lines = text.inputEl.value.split('\n').map(s => normalizePath(s.trim())).filter(Boolean);
            rule.includeFolders = lines;
            await this.plugin.saveSettings();
          });
        });

      new Setting(ruleContainer)
        .setName('Name filter regex / 文件名正则')
        .addText(text =>
          text
            .setValue(rule.nameFilterRegex)
            .onChange(async value => {
              rule.nameFilterRegex = value;
              await this.plugin.saveSettings();
            })
        );
      
      new Setting(ruleContainer)
        .setName('Include tags / 包含标签')
        .setDesc('One tag per line, without # / 每行一个标签，无需#')
        .addTextArea(text => {
          text.setValue(rule.includeTags.join('\n'));
          text.inputEl.addEventListener('blur', async () => {
            const lines = text.inputEl.value.split('\n').map(s => s.trim()).filter(Boolean);
            rule.includeTags = lines;
            await this.plugin.saveSettings();
          });
        });

      new Setting(ruleContainer)
        .addButton(button => {
          button.setButtonText('Delete rule / 删除规则')
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.triggerFilterRules.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });
    });

    new Setting(containerEl)
      .addButton(button =>
        button
          .setButtonText('Add rule / 添加规则')
          .onClick(async () => {
            this.plugin.settings.triggerFilterRules.push({
              prefix: '',
              name: '',
              includeFolders: [],
              nameFilterRegex: '',
              includeTags: []
            });
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }
}

/** 自动建议类 */
class FileSuggest extends EditorSuggest<{ label: string; file: TFile; path: string }> {
  plugin: QuickLinkPlugin;

  constructor(app: App, plugin: QuickLinkPlugin) {
    super(app);
    this.plugin = plugin;
    console.log('QuickLink: FileSuggest constructor');
  }

  getSuggestions(context: EditorSuggestContext): { label: string; file: TFile; path: string }[] {
    console.log('QuickLink: getSuggestions called', context.query);
    // 取出输入内容并去掉前导空白字符
    const rawQuery = context.query;
    const fullQuery = rawQuery.trimStart();
    const globalTrigger = this.plugin.settings.autocompleteTriggerPhrase;
    // 全局排除文件夹
    let files = this.app.vault.getMarkdownFiles()
      .filter(f => !this.plugin.settings.excludeFolders.some(folder => f.path.startsWith(normalizePath(folder) + '/')));

    // 解析触发规则
    const rule = this.plugin.settings.triggerFilterRules.find(r => r.prefix.length > 0 && fullQuery.startsWith(r.prefix));
    // 去掉前缀后的实际查询，并去除两侧空白
    const actualQuery = rule
      ? fullQuery.slice(rule.prefix.length).trim()
      : fullQuery.slice(globalTrigger.length).trim();

    // 应用规则过滤
    if (rule) {
      if (rule.includeFolders.length) {
        files = files.filter(f => rule.includeFolders.some(folder => f.path.startsWith(normalizePath(folder) + '/')));
      }
      if (rule.nameFilterRegex) {
        try {
            const regex = new RegExp(rule.nameFilterRegex);
            files = files.filter(f => regex.test(f.basename));
        } catch (e) {
            // ignore invalid regex
        }
      }
      // tag 过滤（忽略 '#', 匹配用户输入的标签）
      if (rule.includeTags && rule.includeTags.length) {
        files = files.filter(f => {
          const cache = this.app.metadataCache.getFileCache(f);
          if (!cache) return false;
          const allTags = getAllTags(cache) || [];
          return allTags.some(tag => rule.includeTags.includes(tag.substring(1)));
        });
      }
    }
    if (!rule && this.plugin.settings.mainPaths?.length) {
      files = files.filter(f =>
        this.plugin.settings.mainPaths.some(p => f.path.startsWith(normalizePath(p) + '/'))
      );
    }

    // 应用查询过滤
    if (actualQuery) {
      const q = actualQuery.toLowerCase();
      files = files.filter(f => f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }

    // 限制返回数量
    const result = files.slice(0, 50).map(f => ({ label: f.basename, file: f, path: f.path }));
    console.log('QuickLink: getSuggestions result', result);
    return result;
  }

  renderSuggestion(sug: { label: string; file: TFile; path: string }, el: HTMLElement): void {
    console.log('QuickLink: renderSuggestion', sug.label);
    el.setText(sug.label);
    const parts = sug.path.split('/');
    parts.pop();
    el.createSpan({ cls: 'suggestion-note', text: ` (${parts.join('/')})` });
  }

  async selectSuggestion(
    sug: { label: string; file: TFile; path: string },
    evt: MouseEvent
  ): Promise<void> {
    console.log('QuickLink: selectSuggestion', sug.label);
    if (!this.context) return;
    const { editor, start, end, file } = this.context as EditorSuggestContext;
    const alias = evt.shiftKey ? this.context.query : undefined;
    const link = await generateMarkdownLink(this.app, sug.file, file.path, alias, this.plugin);
    editor.replaceRange(link, start, end);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestContext | null {
    console.log('QuickLink: onTrigger called');
    if (!this.plugin.settings.isAutosuggestEnabled) return null;
    const position = editor.getCursor();
    const line = editor.getLine(position.line);
    let idx = -1;
    // 先检测自定义前缀（直接匹配规则）
    let usedTrigger = '';
    for (const rule of this.plugin.settings.triggerFilterRules) {
      if (rule.prefix.length > 0) {
        const i = line.lastIndexOf(rule.prefix, position.ch - rule.prefix.length);
        if (i !== -1) {
          idx = i;
          usedTrigger = rule.prefix;
          break;
        }
      }
    }
    // 如果不存在自定义前缀，再检测全局触发符
    if (idx === -1) {
      const trigger = this.plugin.settings.autocompleteTriggerPhrase;
      const i = line.lastIndexOf(trigger, position.ch - trigger.length);
      if (i !== -1) {
        idx = i;
        usedTrigger = trigger;
      }
    }
    if (idx === -1) return null;
    const start = { line: position.line, ch: idx };
    const end = position;
    // 返回包含前缀或全局触发符在内的 query
    const query = line.substring(idx, position.ch);
    console.log('QuickLink: onTrigger matched', { usedTrigger, query });
    return { editor, file, start, end, query };
  }
}

/** 主插件类 */
export default class QuickLinkPlugin extends Plugin {
  settings: QuickLinkSettings;
  suggest: FileSuggest;

  async onload() {
    console.log('QuickLink: onload called');
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.suggest = new FileSuggest(this.app, this);
    console.log('QuickLink: FileSuggest instance created');
    this.registerEditorSuggest(this.suggest);
    console.log('QuickLink: registerEditorSuggest called');
    this.addRibbonIcon('link-2', 'Auto Link Scan', () => {
      this.runAutoScan();
    });
    this.addCommand({
        id: 'run-auto-scan',
        name: 'Auto link scan in current file',
        checkCallback: (checking: boolean) => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                if (!checking) {
                    this.runAutoScan();
                }
                return true;
            }
            return false;
        }
    });
  }

  onunload() {}

  /** 自动扫描当前文档，链接主体文件夹下匹配的文件名 */
  async runAutoScan(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('Please use this feature in a Markdown view');
      return;
    }
    const file = view.file;
    let targets = this.app.vault.getMarkdownFiles();
    if (this.settings.mainPaths?.length) {
      targets = targets.filter(f =>
        this.settings.mainPaths.some(p => f.path.startsWith(normalizePath(p) + '/'))
      );
    }
    let totalCount = 0;

    await this.app.vault.process(file, (content) => {
        let newContent = content;
        for (const tf of targets) {
            const name = tf.basename;
            // Match whole name with non-word boundary, supporting Chinese
            const pattern = `(^|\\W)${escapeRegExp(name)}(?=\\W|$)`;
            const regex = new RegExp(pattern, 'g');
            // Find matches on the current newContent
            const matches = newContent.match(regex);
            if (matches && matches.length > 0) {
                totalCount += matches.length;
                const linkText = this.app.fileManager.generateMarkdownLink(tf, file.path, undefined, name);
                // Replace occurrences, preserving preceding character
                newContent = newContent.replace(regex, (_match, p1) => `${p1}${linkText}`);
            }
        }
        return newContent;
    });

    new Notice(`Auto scan complete. ${totalCount} links were created.`);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}