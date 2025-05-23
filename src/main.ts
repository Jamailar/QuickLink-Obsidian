import { App, Plugin, PluginSettingTab, Setting, Notice, EditorSuggest, TFile, EditorSuggestContext, EditorPosition, Editor, SuggestModal, TextAreaComponent, MarkdownView } from 'obsidian';

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
  alias: string | undefined,
  plugin: QuickLinkPlugin
): Promise<string> {
  // 文件路径与名称处理
  let filePath = file.path.replace(/\.md$/, '');
  const fileName = file.basename;

  // Advanced URI 逻辑
  if (plugin.settings.enableAdvancedUri && (app as any).plugins.plugins['obsidian-advanced-uri']) {
    const vaultName = app.vault.getName();
    const fieldName = plugin.settings.advancedUriField;
    let uid: string | null = null;
    try {
      const content = await app.vault.read(file);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const uidMatch = fmMatch[1].match(new RegExp(`${fieldName}:\\s*([^\\s\\n]+)`));
        if (uidMatch) uid = uidMatch[1];
      }
      if (!uid) {
        const inline = content.match(new RegExp(`\\n${fieldName}:\\s*([^\\s\\n]+)`));
        if (inline) uid = inline[1];
      }
    } catch {}
    let advancedUri: string;
    if (uid) {
      const param = encodeURIComponent(fieldName);
      advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&${param}=${encodeURIComponent(uid)}`;
    } else {
      advancedUri = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`;
    }
    return alias ? `[${alias}](${advancedUri})` : `[${fileName}](${advancedUri})`;
  }

  // 普通链接逻辑
  const useMdLinks = (app.vault as any).getConfig('useMarkdownLinks');
  if (useMdLinks) {
    const target = alias ? `[${alias}](${fileName})` : `[${fileName}](${fileName})`;
    return target;
  }
  return alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
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
    containerEl.createEl('h2', { text: 'Quick File Linker Settings / 快速文件链接设置' });

    new Setting(containerEl)
      .setName('Enable Suggestions / 启用建议')
      .setDesc(`Trigger on '${this.plugin.settings.autocompleteTriggerPhrase}' / 使用 '${this.plugin.settings.autocompleteTriggerPhrase}' 触发文件建议`)
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.isAutosuggestEnabled)
          .onChange(async value => {
            this.plugin.settings.isAutosuggestEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Trigger Character / 触发字符')
      .setDesc('Character that will trigger file suggestions / 触发文件建议的字符')
      .addText(text =>
        text
          .setValue(this.plugin.settings.autocompleteTriggerPhrase)
          .onChange(async value => {
            this.plugin.settings.autocompleteTriggerPhrase = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('主体文件夹 / Main Folders')
      .setDesc(
        '设置该文件夹用于自动扫描文档进行自动连接创建。\n' +
        '使用全局触发符时，仅在这些文件夹中搜索（留空表示全局）'
      )
      .addTextArea(
        text => {
          const input = text.inputEl;
          const wrapper = input.parentElement as HTMLElement;
          wrapper.addClass('quicklink-wrapper');
          // Use Obsidian DOM helpers for suggestion container
          const suggestEl = wrapper.createDiv();
          suggestEl.addClass('quicklink-inline-suggestions');
          // handler to update suggestions, used on input and focus
          const updateSuggestions = async () => {
            const lines = input.value.split('\n').map(s => s.trim()).filter(Boolean);
            this.plugin.settings.mainPaths = lines;
            await this.plugin.saveSettings();
            const cursorPos = input.selectionStart || 0;
            const before = input.value.substring(0, cursorPos);
            const parts = before.split('\n');
            const current = parts[parts.length - 1];
            let suggestions: string[] = [];
            const files = this.app.vault.getMarkdownFiles();
            if (!current.includes('/')) {
              const set = new Set<string>();
              files.forEach(f => {
                const p = f.path.split('/')[0];
                if (f.path.includes('/')) set.add(p);
              });
              suggestions = Array.from(set);
            } else {
              const base = current.endsWith('/') ? current : current + '/';
              const set = new Set<string>();
              files.forEach(f => {
                if (f.path.startsWith(base)) {
                  const rem = f.path.substring(base.length);
                  const slashIndex = rem.indexOf('/');
                  if (slashIndex !== -1) {
                    const next = rem.substring(0, slashIndex);
                    set.add(base + next);
                  }
                }
              });
              suggestions = Array.from(set);
            }
            const q = current.toLowerCase();
            suggestions = suggestions
              .filter(s => s.toLowerCase().includes(q))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 50);
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
            suggestions.forEach(sug => {
              const item = suggestEl.createDiv({ cls: 'quicklink-suggestion-item', text: sug });
              item.addEventListener('mousedown', async (e: MouseEvent) => {
                e.preventDefault();
                const allLines = input.value.split('\n');
                allLines[parts.length - 1] = sug;
                input.value = allLines.join('\n');
                this.plugin.settings.mainPaths = allLines.filter(s => s.trim());
                await this.plugin.saveSettings();
                // Clear existing suggestions
                while (suggestEl.firstChild) {
                  suggestEl.removeChild(suggestEl.firstChild);
                }
              });
            });
          };
          input.addEventListener('input', updateSuggestions);
          input.addEventListener('focus', updateSuggestions);
          input.addEventListener('blur', () => {
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
          });
        }
      );

    new Setting(containerEl)
      .setName('Exclude Folders / 排除文件夹')
      .setDesc('Folders to exclude from search (one per line) / 排除搜索的文件夹（每行一个）')
      .addTextArea(text => {
        const input = text.inputEl;
        const wrapper = input.parentElement as HTMLElement;
        wrapper.addClass('quicklink-wrapper');
        const suggestEl = wrapper.createDiv();
        suggestEl.addClass('quicklink-inline-suggestions');
        const updateSuggestions = async () => {
          const lines = input.value.split('\n').map(s => s.trim()).filter(Boolean);
          this.plugin.settings.excludeFolders = lines;
          await this.plugin.saveSettings();
          const cursorPos = input.selectionStart || 0;
          const before = input.value.substring(0, cursorPos);
          const parts = before.split('\n');
          const current = parts[parts.length - 1];
          let suggestions: string[] = [];
          const files = this.app.vault.getMarkdownFiles();
          if (!current.includes('/')) {
            const set = new Set<string>();
            files.forEach(f => {
              const p = f.path.split('/')[0];
              if (f.path.includes('/')) set.add(p);
            });
            suggestions = Array.from(set);
          } else {
            const base = current.endsWith('/') ? current : current + '/';
            const set = new Set<string>();
            files.forEach(f => {
              if (f.path.startsWith(base)) {
                const rem = f.path.substring(base.length);
                const slash = rem.indexOf('/');
                if (slash !== -1) {
                  const next = rem.substring(0, slash);
                  set.add(base + next);
                }
              }
            });
            suggestions = Array.from(set);
          }
          const q = current.toLowerCase();
          suggestions = suggestions
            .filter(s => s.toLowerCase().includes(q))
            .sort((a, b) => a.localeCompare(b))
            .slice(0, 50);
          // Clear existing suggestions
          while (suggestEl.firstChild) {
            suggestEl.removeChild(suggestEl.firstChild);
          }
          suggestions.forEach(sug => {
            const item = suggestEl.createDiv({ cls: 'quicklink-suggestion-item', text: sug });
            item.addEventListener('mousedown', async (e: MouseEvent) => {
              e.preventDefault();
              const all = input.value.split('\n');
              all[parts.length - 1] = sug;
              input.value = all.join('\n');
              this.plugin.settings.excludeFolders = all.filter(s => s.trim());
              await this.plugin.saveSettings();
              // Clear existing suggestions
              while (suggestEl.firstChild) {
                suggestEl.removeChild(suggestEl.firstChild);
              }
            });
            suggestEl.addEventListener('mouseleave', () => {
              // Clear existing suggestions
              while (suggestEl.firstChild) {
                suggestEl.removeChild(suggestEl.firstChild);
              }
            });
          });
        };
        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => {
          // Clear existing suggestions
          while (suggestEl.firstChild) {
            suggestEl.removeChild(suggestEl.firstChild);
          }
        });
      });

    new Setting(containerEl)
      .setName('Enable Advanced URI Integration / 启用高级 URI 集成')
      .setDesc('If installed, new links will use Advanced URI format / 如果安装了此插件，生成高级 URI 格式的链接')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableAdvancedUri)
          .onChange(async value => {
            this.plugin.settings.enableAdvancedUri = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('UID Field Name / UID 字段名')
      .setDesc('Frontmatter field name for UID used in Advanced URI / 用于 Advanced URI 的前置字段名')
      .addText(text =>
        text
          .setPlaceholder('uid')
          .setValue(this.plugin.settings.advancedUriField)
          .onChange(async value => {
            this.plugin.settings.advancedUriField = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Custom Rules / 自定义规则' });

    // Trigger Filter Rules 列表
    this.plugin.settings.triggerFilterRules.forEach((rule, index) => {
      // Wrap each rule in a collapsible details element
      const details = containerEl.createEl('details');
      details.addClass('quicklink-rule-panel');
      // Summary line shows rule number, prefix and name
      const summary = details.createEl('summary', {
        text: `Rule ${index + 1}: [${rule.prefix || '<未设置>'}] - ${rule.name || '<未命名>'}`
      });
      summary.addClass('quicklink-rule-summary');
      // Container for rule settings
      const ruleContainer = details.createDiv();

      // Prefix setting with delete button
      new Setting(ruleContainer)
        .setName('Prefix / 前缀')
        .setDesc('触发规则前缀字符')
        .addText(text =>
          text
            .setValue(rule.prefix)
            .onChange(value => {
              rule.prefix = value;
            })
        )
        .addExtraButton(btn =>
          btn.setIcon('trash')
             .setTooltip('Delete / 删除')
             .onClick(async () => {
               this.plugin.settings.triggerFilterRules.splice(index, 1);
               await this.plugin.saveSettings();
               this.display();
             })
        );

      // Name setting
      new Setting(ruleContainer)
        .setName('Name / 名称')
        .setDesc('规则显示名称')
        .addText(text =>
          text
            .setValue(rule.name)
            .onChange(value => {
              rule.name = value;
            })
        );

      // Include Folders
      new Setting(ruleContainer)
        .setName('Include Folders / 包含文件夹')
        .setDesc('仅在这些文件夹中搜索（每行一个）')
        .addTextArea(text => {
          const input = text.inputEl;
          const wrapper = input.parentElement as HTMLElement;
          wrapper.addClass('quicklink-wrapper');
          const suggestEl = wrapper.createDiv();
          suggestEl.addClass('quicklink-inline-suggestions');
          const updateSuggestions = async () => {
            const lines = input.value.split('\n').map(s => s.trim()).filter(Boolean);
            rule.includeFolders = lines;
            await this.plugin.saveSettings();
            const cursorPos = input.selectionStart || 0;
            const before = input.value.substring(0, cursorPos);
            const parts = before.split('\n');
            const current = parts[parts.length - 1];
            let suggestions: string[] = [];
            const files = this.app.vault.getMarkdownFiles();
            if (!current.includes('/')) {
              const set = new Set<string>();
              files.forEach(f => {
                const p = f.path.split('/')[0];
                if (f.path.includes('/')) set.add(p);
              });
              suggestions = Array.from(set);
            } else {
              const base = current.endsWith('/') ? current : current + '/';
              const set = new Set<string>();
              files.forEach(f => {
                if (f.path.startsWith(base)) {
                  const rem = f.path.substring(base.length);
                  const slash = rem.indexOf('/');
                  if (slash !== -1) {
                    const next = rem.substring(0, slash);
                    set.add(base + next);
                  }
                }
              });
              suggestions = Array.from(set);
            }
            const q = current.toLowerCase();
            suggestions = suggestions
              .filter(s => s.toLowerCase().includes(q))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 50);
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
            suggestions.forEach(sug => {
              const item = suggestEl.createDiv({ cls: 'quicklink-suggestion-item', text: sug });
              item.addEventListener('mousedown', async (e: MouseEvent) => {
                e.preventDefault();
                const all = input.value.split('\n');
                all[parts.length - 1] = sug;
                input.value = all.join('\n');
                rule.includeFolders = all.filter(s => s.trim());
                await this.plugin.saveSettings();
                // Clear existing suggestions
                while (suggestEl.firstChild) {
                  suggestEl.removeChild(suggestEl.firstChild);
                }
              });
              suggestEl.addEventListener('mouseleave', () => {
                // Clear existing suggestions
                while (suggestEl.firstChild) {
                  suggestEl.removeChild(suggestEl.firstChild);
                }
              });
            });
          };
          input.addEventListener('input', updateSuggestions);
          input.addEventListener('focus', updateSuggestions);
          input.addEventListener('blur', () => {
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
          });
        });

      // Name Filter Regex
      new Setting(ruleContainer)
        .setName('Name Filter Regex / 文件名正则')
        .setDesc('仅匹配符合此正则的文件名')
        .addText(text =>
          text
            .setValue(rule.nameFilterRegex)
            .onChange(value => {
              rule.nameFilterRegex = value;
            })
        );

      // Include Tags
      new Setting(ruleContainer)
        .setName('Include Tags / 包含标签')
        .setDesc('仅在包含这些标签的文件中搜索（每行一个）')
        .addTextArea(text => {
          const input = text.inputEl;
          const wrapper = input.parentElement as HTMLElement;
          wrapper.addClass('quicklink-wrapper');
          const suggestEl = wrapper.createDiv();
          suggestEl.addClass('quicklink-inline-suggestions');
          // Gather all unique tags in the vault
          const allTags = Array.from(
            new Set(
              this.app.vault.getMarkdownFiles().flatMap(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                return cache?.tags?.map(t => t.tag.startsWith('#') ? t.tag.substring(1) : t.tag) || [];
              })
            )
          );
          const updateSuggestions = async () => {
            // Save current lines as includeTags
            const lines = input.value.split('\n').map(s => s.trim()).filter(Boolean);
            rule.includeTags = lines;
            await this.plugin.saveSettings();
            const cursorPos = input.selectionStart || 0;
            const before = input.value.substring(0, cursorPos);
            const parts = before.split('\n');
            const current = parts[parts.length - 1].toLowerCase();
            // Filter and sort tags
            const suggestions = allTags
              .filter(tag => tag.toLowerCase().includes(current))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 50);
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
            suggestions.forEach(tag => {
              const item = suggestEl.createDiv({ cls: 'quicklink-suggestion-item', text: tag });
              item.addEventListener('mousedown', async (e: MouseEvent) => {
                e.preventDefault();
                // Replace current line with selected tag
                const allLines = input.value.split('\n');
                allLines[parts.length - 1] = tag;
                input.value = allLines.join('\n');
                rule.includeTags = allLines.filter(s => s.trim());
                await this.plugin.saveSettings();
                // Clear existing suggestions
                while (suggestEl.firstChild) {
                  suggestEl.removeChild(suggestEl.firstChild);
                }
              });
            });
          };
          input.addEventListener('input', updateSuggestions);
          input.addEventListener('focus', updateSuggestions);
          input.addEventListener('blur', () => {
            // Clear existing suggestions
            while (suggestEl.firstChild) {
              suggestEl.removeChild(suggestEl.firstChild);
            }
          });
        });

      // Save Rule button
      new Setting(ruleContainer)
        .addButton(btn =>
          btn
            .setButtonText('Save Rule / 保存规则')
            .setCta()
            .onClick(async () => {
              await this.plugin.saveSettings();
              new Notice(`Saved rule ${rule.prefix || '(no prefix)'}`);
            })
        );
    });
    // 添加新规则按钮
    new Setting(containerEl)
      .addButton(button =>
        button.setButtonText('Add Rule / 添加规则')
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
    // UID Management section removed
  }
}

/** 自动建议类 */
class FileSuggest extends EditorSuggest<{ label: string; file: TFile; path: string }> {
  plugin: QuickLinkPlugin;

  constructor(app: App, plugin: QuickLinkPlugin) {
    super(app);
    this.plugin = plugin;
    console.log('QuickLink: FileSuggest initialized');
  }

  getSuggestions(context: EditorSuggestContext): { label: string; file: TFile; path: string }[] {
    // 取出输入内容并去掉前导空白字符
    const rawQuery = context.query;
    const fullQuery = rawQuery.trimStart();
    const globalTrigger = this.plugin.settings.autocompleteTriggerPhrase;
    console.log(`QuickLink getSuggestions: fullQuery='${fullQuery}', rules=${JSON.stringify(this.plugin.settings.triggerFilterRules)}`);
    // 全局排除文件夹
    let files = this.app.vault.getMarkdownFiles()
      .filter(f => !this.plugin.settings.excludeFolders.some(folder => f.path.startsWith(folder + '/')));

    // 解析触发规则
    const rule = this.plugin.settings.triggerFilterRules.find(r => r.prefix.length > 0 && fullQuery.startsWith(r.prefix));
    console.log(`QuickLink matched rule: ${rule ? rule.prefix : 'none'}`);
    // 去掉前缀后的实际查询，并去除两侧空白
    const actualQuery = rule
      ? fullQuery.slice(rule.prefix.length).trim()
      : fullQuery.slice(globalTrigger.length).trim();

    // 应用规则过滤
    if (rule) {
      if (rule.includeFolders.length) {
        files = files.filter(f => rule.includeFolders.some(folder => f.path.startsWith(folder + '/')));
      }
      if (rule.nameFilterRegex) {
        const regex = new RegExp(rule.nameFilterRegex);
        files = files.filter(f => regex.test(f.basename));
      }
      // tag 过滤（忽略 '#', 匹配用户输入的标签）
      if (rule.includeTags && rule.includeTags.length) {
        files = files.filter(f => {
          const cache = this.app.metadataCache.getFileCache(f);
          if (!cache?.tags) return false;
          return cache.tags!.some(t => {
            // strip leading '#' if present
            const tagName = t.tag.startsWith('#') ? t.tag.substring(1) : t.tag;
            return rule.includeTags.includes(tagName);
          });
        });
      }
    }
    if (!rule && this.plugin.settings.mainPaths?.length) {
      files = files.filter(f =>
        this.plugin.settings.mainPaths.some(p => f.path.startsWith(p + '/'))
      );
    }

    // 应用查询过滤
    if (actualQuery) {
      const q = actualQuery.toLowerCase();
      files = files.filter(f => f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }

    // 限制返回数量
    return files.slice(0, 50).map(f => ({ label: f.basename, file: f, path: f.path }));
  }

  renderSuggestion(sug: { label: string; file: TFile; path: string }, el: HTMLElement): void {
    el.setText(sug.label);
    const parts = sug.path.split('/');
    parts.pop();
    el.createSpan({ cls: 'suggestion-note', text: ` (${parts.join('/')})` });
  }

  async selectSuggestion(
    sug: { label: string; file: TFile; path: string },
    evt: MouseEvent
  ): Promise<void> {
    if (!this.context) return;
    const { editor, start, end } = this.context as EditorSuggestContext;
    const alias = evt.shiftKey ? this.context.query : undefined;
    const link = await generateMarkdownLink(this.app, sug.file, alias, this.plugin);
    editor.replaceRange(link, start, end);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestContext | null {
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
    console.log(`QuickLink onTrigger: detected query='${query}', usedTrigger='${usedTrigger}'`);
    return { editor, file, start, end, query };
  }
}

/** 主插件类 */
export default class QuickLinkPlugin extends Plugin {
  settings: QuickLinkSettings;
  suggest: FileSuggest;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.suggest = new FileSuggest(this.app, this);
    this.registerEditorSuggest(this.suggest);
    this.addRibbonIcon('link-2', 'Auto Link Scan / 自动扫描', () => {
      this.runAutoScan();
    });
  }

  onunload() {}

  /** 自动扫描当前文档，链接主体文件夹下匹配的文件名 */
  async runAutoScan(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('请在 Markdown 视图中使用此功能');
      return;
    }
    const file = view.file;
    const content = await this.app.vault.read(file);
    let targets = this.app.vault.getMarkdownFiles();
    if (this.settings.mainPaths?.length) {
      targets = targets.filter(f =>
        this.settings.mainPaths.some(p => f.path.startsWith(p + '/'))
      );
    }
    console.log('QuickLink runAutoScan: target files:', targets.map(f => f.path));
    let newContent = content;
    let totalCount = 0;
    for (const tf of targets) {
      console.log(`QuickLink runAutoScan: scanning file basename='${tf.basename}' path='${tf.path}'`);
      const name = tf.basename;
      // Match whole name with non-word boundary, supporting Chinese
      const pattern = `(^|\\W)${escapeRegExp(name)}(?=\\W|$)`;
      const regex = new RegExp(pattern, 'g');
      // Find matches on the current newContent
      const matches = newContent.match(regex);
      if (matches && matches.length > 0) {
        console.log(`QuickLink runAutoScan: found ${matches.length} matches for '${name}'`);
        totalCount += matches.length;
        const linkText = await generateMarkdownLink(this.app, tf, undefined, this);
        console.log(`QuickLink runAutoScan: linkText='${linkText}'`);
        // Replace occurrences, preserving preceding character
        newContent = newContent.replace(regex, (_match, p1) => `${p1}${linkText}`);
      }
    }
    console.log(`QuickLink runAutoScan: total replacements to apply: ${totalCount}`);
    await this.app.vault.modify(file, newContent);
    new Notice(`自动扫描完成，已链接 ${totalCount} 处`);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}