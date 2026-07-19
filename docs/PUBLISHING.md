# 发布到 VS Code Marketplace

本仓库已准备好打包字段（`publisher`、`icon`、`LICENSE`、`CHANGELOG`、`repository` 等）。**真正上架仍需你在浏览器里完成账号与 Token**（无法代你登录 Microsoft / Azure）。

扩展 ID 将为：`codebind.codebind-docs`  
仓库：https://github.com/elmagnificogi/CodeBindDocs

---

## 你需要亲自完成的步骤

### 推荐：网页上传 `.vsix`（个人账号最省事，**不需要 PAT**）

很多人卡在 Azure Portal / PAT。个人 Microsoft 账号（`@outlook.com` / `@live.com` 等）**不要**去 [portal.azure.com](https://portal.azure.com)——容易出现 `AADSTS16000`（账号不在 `Microsoft Services` 租户里）。

正确做法：

1. 本机已有包：`npm run package` → 得到 `codebind-docs-x.y.z.vsix`
2. **无痕窗口**打开：[Marketplace 管理页](https://marketplace.visualstudio.com/manage)
3. 用个人 Microsoft 账号登录
4. 若还没有 Publisher：点 **Create publisher**，ID 填 **`codebind`**
5. 选中该 Publisher → **New extension** / 更新已有扩展 → 上传 `.vsix`
6. 等审核通过（常见几分钟到几十分钟；版本 `flags` 需变为 `validated` 后才可搜索安装）

这样**全程不经过 Azure Portal，也不用 PAT**。

> Marketplace 分类只能用官方枚举（如 `Other`），不能写 `Documentation`。

---

### 若你坚持用 `vsce publish`：再弄 PAT

CLI 才需要 Token。**不要**在 Azure Portal 里找 Token。

#### 路径 A（优先）：Marketplace 管理页里的 Security

1. 无痕窗口打开 https://marketplace.visualstudio.com/manage  
2. 登录并进入你的 Publisher（如 `codebind`）  
3. 找 **Security** / **Personal access tokens** → 新建  
4. Organization 选 **All accessible organizations**  
5. 权限勾 **Marketplace → Manage**  
6. 复制 Token，终端执行：

```bash
npx vsce login codebind
npm run publish:vsce
```

#### 路径 B：Azure DevOps（不是 Azure Portal）

注意域名是 **`dev.azure.com`**，不是 `portal.azure.com`。

1. 无痕窗口打开 https://dev.azure.com/  
2. 同一微软账号登录；若提示建 Organization，随便起个名字建一个  
3. 右上角头像 → **Personal access tokens** → **New Token**  
4. Organization：**All accessible organizations**  
5. Scopes：Custom → **Marketplace → Manage**  
6. 复制后 `npx vsce login codebind`

---

### （可选）同步 Open VSX

Cursor / 部分环境也会用 [Open VSX](https://open-vsx.org/)：

1. 在 https://open-vsx.org/ 注册并创建 namespace（可与 `codebind` 对齐）
2. 生成 Open VSX token
3. `npx ovsx publish --no-dependencies -p <token>`  
   或 `npm run publish:ovsx`（需事先 `ovsx login`）

---

## 本仓库已替你做好的

| 项 | 状态 |
|----|------|
| `package.json`：name / displayName / publisher / engines / categories | ✅ |
| `icon`：`media/icon.png`（≥128px，非 SVG） | ✅ |
| `LICENSE`（MIT） | ✅ |
| `CHANGELOG.md` | ✅ |
| `repository` / `bugs` / `homepage` | ✅ |
| `.vscodeignore` | ✅ |
| `vscode:prepublish` → compile | ✅ |
| `@vscode/vsce` / `ovsx` 与 npm scripts | ✅ |

```bash
npm run package
# code --install-extension codebind-docs-x.y.z.vsix
```

README 改动（含截图）**不会**自动同步到市场页，需升版本后重新打包上传。

---

## 上架后建议

1. 用 `@id:codebind.codebind-docs` 安装验证  
2. 发 GitHub Release，附上同一 `.vsix`  
3. 后续：`npx vsce publish patch|minor|major --no-dependencies`，并更新 `CHANGELOG.md`  
