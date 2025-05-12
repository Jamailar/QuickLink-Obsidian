import { App, Plugin, PluginSettingTab, Setting, Notice, EditorSuggest, TFile, EditorSuggestContext, EditorPosition, Editor, SuggestModal, TextAreaComponent } from 'obsidian';

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
}

// 更新默认设置
const DEFAULT_SETTINGS: QuickLinkSettings = {
  autocompleteTriggerPhrase: '@',
  isAutosuggestEnabled: true,
  excludeFolders: [],
  enableAdvancedUri: false,
  triggerFilterRules: [],
  mainPaths: [],
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
    let uid: string | null = null;
    try {
      const content = await app.vault.read(file);
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const uidMatch = fmMatch[1].match(/uid:\s*([^\s\n]+)/);
        if (uidMatch) uid = uidMatch[1];
      }
      if (!uid) {
        const inline = content.match(/\nuid:\s*([^\s\n]+)/);
        if (inline) uid = inline[1];
      }
    } catch {}
    const uri = uid
      ? `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&uid=${encodeURIComponent(uid)}`
      : `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&filepath=${encodeURIComponent(filePath)}`;
    return alias ? `[${alias}](${uri})` : `[${fileName}](${uri})`;
  }

  // 普通链接逻辑
  const useMdLinks = (app.vault as any).getConfig('useMarkdownLinks');
  if (useMdLinks) {
    const target = alias ? `[${alias}](${fileName})` : `[${fileName}](${fileName})`;
    return target;
  }
  return alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
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
          // Ensure wrapper is positioned for absolute suggestion container
          const wrapper = input.parentElement as HTMLElement;
          wrapper.style.position = 'relative';

          // Create inline suggestions container
          const suggestEl = document.createElement('div');
          suggestEl.className = 'quicklink-inline-suggestions';
          Object.assign(suggestEl.style, {
            position: 'absolute',
            top: `${input.offsetHeight + 2}px`,
            left: '0',
            right: '0',
            zIndex: '100',
            background: 'var(--background-primary)',
            border: '1px solid var(--interactive-normal)',
            maxHeight: '200px',
            overflowY: 'auto',
          });
          wrapper.appendChild(suggestEl);

          // handler to update suggestions, used on input and focus
          const updateSuggestions = async () => {
            // Save all lines as mainPaths
            const lines = input.value.split('\n').map(s => s.trim()).filter(Boolean);
            this.plugin.settings.mainPaths = lines;
            await this.plugin.saveSettings();

            // Determine current line prefix
            const cursorPos = input.selectionStart || 0;
            const before = input.value.substring(0, cursorPos);
            const parts = before.split('\n');
            const current = parts[parts.length - 1];

            // Gather folder suggestions
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

            // Filter, sort, and limit
            const q = current.toLowerCase();
            suggestions = suggestions
              .filter(s => s.toLowerCase().includes(q))
              .sort((a, b) => a.localeCompare(b))
              .slice(0, 50);

            // Render suggestions
            suggestEl.innerHTML = '';
            suggestions.forEach(sug => {
              const item = document.createElement('div');
              item.textContent = sug;
              Object.assign(item.style, { padding: '4px', cursor: 'pointer', textAlign: 'right' });
              item.addEventListener('mousedown', async e => {
                e.preventDefault();
                // Replace current line with selected suggestion
                const allLines = input.value.split('\n');
                allLines[parts.length - 1] = sug;
                input.value = allLines.join('\n');
                this.plugin.settings.mainPaths = allLines.filter(s => s.trim());
                await this.plugin.saveSettings();
                suggestEl.innerHTML = '';
              });
              suggestEl.appendChild(item);
            });
          };

          // Hook update on input and focus, clear on blur
          input.addEventListener('input', updateSuggestions);
          input.addEventListener('focus', updateSuggestions);
          input.addEventListener('blur', () => { suggestEl.innerHTML = ''; });

          // Right-align suggestion container beneath input
          suggestEl.style.left = 'auto';
          suggestEl.style.right = '0';
        }
      );

    new Setting(containerEl)
      .setName('Exclude Folders / 排除文件夹')
      .setDesc('Folders to exclude from search (one per line) / 排除搜索的文件夹（每行一个）')
      .addTextArea(text => {
        const input = text.inputEl;
        const wrapper = input.parentElement as HTMLElement;
        wrapper.style.position = 'relative';
        const suggestEl = document.createElement('div');
        suggestEl.className = 'quicklink-inline-suggestions';
        Object.assign(suggestEl.style, {
          position: 'absolute',
          top: `${input.offsetHeight + 2}px`,
          left: 'auto',
          right: '0',
          zIndex: '100',
          background: 'var(--background-primary)',
          border: '1px solid var(--interactive-normal)',
          maxHeight: '200px',
          overflowY: 'auto',
        });
        wrapper.appendChild(suggestEl);

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

          suggestEl.innerHTML = '';
          suggestions.forEach(sug => {
            const item = document.createElement('div');
            item.textContent = sug;
            Object.assign(item.style, { padding: '4px', cursor: 'pointer', textAlign: 'right' });
            item.addEventListener('mousedown', async e => {
              e.preventDefault();
              const all = input.value.split('\n');
              all[parts.length - 1] = sug;
              input.value = all.join('\n');
              this.plugin.settings.excludeFolders = all.filter(s => s.trim());
              await this.plugin.saveSettings();
              suggestEl.innerHTML = '';
            });
            suggestEl.addEventListener('mouseleave', () => { suggestEl.innerHTML = ''; });
            suggestEl.appendChild(item);
          });
        };

        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => { suggestEl.innerHTML = ''; });
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

    containerEl.createEl('h3', { text: 'Custom Rules / 自定义规则' });

    // Trigger Filter Rules 列表
    this.plugin.settings.triggerFilterRules.forEach((rule, index) => {
      // Wrap each rule in a collapsible details element
      const details = containerEl.createEl('details');
      // 设置样式使折叠面板更美观
      details.style.marginBottom = '12px';
      details.style.padding = '8px';
      details.style.border = '1px solid var(--interactive-normal)';
      details.style.borderRadius = '4px';
      // (Removed backgroundColor setting)
      // Summary line shows rule number, prefix and name
      const summary = details.createEl('summary', {
        text: `Rule ${index + 1}: [${rule.prefix || '<未设置>'}] - ${rule.name || '<未命名>'}`
      });
      // summary 样式
      summary.style.fontWeight = 'bold';
      summary.style.cursor = 'pointer';
      summary.style.padding = '4px';
      // (Removed backgroundColor setting)
      summary.style.borderRadius = '3px';
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
          wrapper.style.position = 'relative';
          const suggestEl = document.createElement('div');
          suggestEl.className = 'quicklink-inline-suggestions';
          Object.assign(suggestEl.style, {
            position: 'absolute',
            top: `${input.offsetHeight + 2}px`,
            left: 'auto',
            right: '0',
            zIndex: '100',
            background: 'var(--background-primary)',
            border: '1px solid var(--interactive-normal)',
            maxHeight: '200px',
            overflowY: 'auto',
          });
          wrapper.appendChild(suggestEl);

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

            suggestEl.innerHTML = '';
            suggestions.forEach(sug => {
              const item = document.createElement('div');
              item.textContent = sug;
              Object.assign(item.style, { padding: '4px', cursor: 'pointer', textAlign: 'right' });
              item.addEventListener('mousedown', async e => {
                e.preventDefault();
                const all = input.value.split('\n');
                all[parts.length - 1] = sug;
                input.value = all.join('\n');
                rule.includeFolders = all.filter(s => s.trim());
                await this.plugin.saveSettings();
                suggestEl.innerHTML = '';
              });
              suggestEl.addEventListener('mouseleave', () => { suggestEl.innerHTML = ''; });
              suggestEl.appendChild(item);
            });
          };

          input.addEventListener('input', updateSuggestions);
          input.addEventListener('focus', updateSuggestions);
          input.addEventListener('blur', () => { suggestEl.innerHTML = ''; });
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
        .addTextArea(text =>
          text
            .setValue(rule.includeTags.join('\n'))
            .onChange(value => {
              rule.includeTags = value.split('\n').map(s => s.trim()).filter(Boolean);
            })
        );

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
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}