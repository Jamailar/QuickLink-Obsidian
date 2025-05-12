import { App, Plugin, PluginSettingTab, Setting, Notice, EditorSuggest, TFile, SuggestContext, EditorPosition, Editor } from 'obsidian';

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
}

// 更新默认设置
const DEFAULT_SETTINGS: QuickLinkSettings = {
  autocompleteTriggerPhrase: '@',
  isAutosuggestEnabled: true,
  excludeFolders: [],
  enableAdvancedUri: false,
  triggerFilterRules: []
};

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
      .setName('Exclude Folders / 排除文件夹')
      .setDesc('Folders to exclude from search (one per line) / 排除搜索的文件夹（每行一个）')
      .addTextArea(text =>
        text
          .setValue(this.plugin.settings.excludeFolders.join('\n'))
          .onChange(async value => {
            this.plugin.settings.excludeFolders = value.split('\n').map(s => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

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

    // Trigger Filter Rules 列表
    containerEl.createEl('h3', { text: 'Trigger Filter Rules / 触发规则列表' });
    this.plugin.settings.triggerFilterRules.forEach((rule, index) => {
      // 规则标题
      new Setting(containerEl)
        .setName(`Rule ${index + 1}: ${rule.prefix} - ${rule.name}`)
        .addExtraButton(btn =>
          btn.setIcon('trash')
             .setTooltip('Delete / 删除')
             .onClick(async () => {
               this.plugin.settings.triggerFilterRules.splice(index, 1);
               await this.plugin.saveSettings();
               this.display();
             })
        );
      // prefix 设置
      new Setting(containerEl)
        .setName('Prefix / 前缀')
        .setDesc('触发规则前缀字符')
        .addText(text =>
          text.setValue(rule.prefix)
              .onChange(value => {
                rule.prefix = value;
              })
        );
      // name 设置
      new Setting(containerEl)
        .setName('Name / 名称')
        .setDesc('规则显示名称')
        .addText(text =>
          text.setValue(rule.name)
              .onChange(value => {
                rule.name = value;
              })
        );
      // includeFolders 设置
      new Setting(containerEl)
        .setName('Include Folders / 包含文件夹')
        .setDesc('仅在这些文件夹中搜索（每行一个）')
        .addTextArea(text =>
          text.setValue(rule.includeFolders.join('\n'))
              .onChange(value => {
                rule.includeFolders = value.split('\n').map(s => s.trim()).filter(Boolean);
              })
        );
      // nameFilterRegex 设置
      new Setting(containerEl)
        .setName('Name Filter Regex / 文件名正则')
        .setDesc('仅匹配符合此正则的文件名')
        .addText(text =>
          text.setValue(rule.nameFilterRegex)
              .onChange(value => {
                rule.nameFilterRegex = value;
              })
        );
      // includeTags 设置
      new Setting(containerEl)
        .setName('Include Tags / 包含标签')
        .setDesc('仅在包含这些标签的文件中搜索（每行一个）')
        .addTextArea(text =>
          text
            .setValue((rule.includeTags ?? []).join('\n'))
            .onChange(value => {
              rule.includeTags = value.split('\n').map(s => s.trim()).filter(Boolean);
            })
        );
      // 保存按钮
      new Setting(containerEl)
        .addButton(btn =>
          btn
            .setButtonText('Save Rule / 保存规则')
            .setCta()
            .onClick(async () => {
              // 使用最新输入框的值（通过 DOM 读取）
              const inputs = containerEl.querySelectorAll('.setting-item');
              const base = inputs[index * 6]; // 每条规则6个设置块，取第一个的 index 推断起始位置

              // 安全起见不在这里解析 DOM 获取值，而是假设用户已经编辑完成并触发过 onChange
              // 所以这里只保存并不调用 this.display()
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

  getSuggestions(context: SuggestContext): { label: string; file: TFile; path: string }[] {
    // 取出输入内容并去掉前导空白字符
    const rawQuery = context.query;
    const fullQuery = rawQuery.trimStart();
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
      : fullQuery.trim();

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

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): SuggestContext | null {
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
    return { start, end, query };
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