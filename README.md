# PyroTrack 智能进销存系统

PyroTrack 是一个基于 React + Vite + Tailwind CSS 构建的现代化进销存管理系统。支持双仓（爽仓/峰仓）库存管理、DeepSeek 智能文本解析录入、以及详细的利润统计分析。

## 功能特性

- **智能录入**: 支持通过正则或 DeepSeek AI 识别非结构化的出库文本（微信/记事本粘贴）。
- **双仓管理**: 自动计算并分配库存到“爽仓”和“峰仓”。
- **数据隐私**: 数据默认存储在浏览器本地数据库 (IndexedDB)，安全且持久。
- **统计分析**: 提供经手人排名、商品-人员矩阵分布、以及多维度的利润报表。

---

## 🚀 阿里云服务器部署指南

本指南将指导您如何将项目部署到阿里云 ECS 服务器（CentOS/Ubuntu），并通过公网 IP 访问。

### 方式一：生产环境部署 (推荐 - Nginx)

这种方式性能最好，且不需要一直运行终端窗口。

#### 1. 准备工作
1.  **购买 ECS**: 购买一台阿里云 ECS 实例（推荐 Ubuntu 20.04/22.04 或 CentOS 7+）。
2.  **配置安全组 (关键)**:
    - 登录阿里云控制台 -> ECS 实例 -> 安全组 -> 配置规则。
    - **入方向** 添加规则：协议类型选择 `HTTP (80)`，授权对象 `0.0.0.0/0`。
    - 如果需要 HTTPS，请同时开放 `HTTPS (443)`。

#### 2. 本地构建项目
在您的本地电脑上执行以下命令，生成静态文件：

```bash
# 安装依赖
npm install

# 打包构建 (生成 dist 目录)
npm run build
```

构建完成后，项目根目录下会生成一个 `dist` 文件夹。

#### 3. 配置服务器环境 (以 Ubuntu 为例)
使用 SSH 登录您的服务器：

```bash
ssh root@<您的公网IP>
```

安装 Nginx：

```bash
# 更新软件源
apt update

# 安装 Nginx
apt install nginx -y

# 启动 Nginx
systemctl start nginx
systemctl enable nginx
```

#### 4. 上传文件
回到**本地电脑**，将 `dist` 文件夹内的文件上传到服务器的 `/var/www/html` 目录（Nginx 默认目录）。

*使用 scp 命令上传 (在本地终端执行):*
```bash
scp -r dist/* root@<您的公网IP>:/var/www/html/
```
*(或者使用 FileZilla 等 FTP 工具上传)*

#### 5. 配置与访问
上传完成后，Nginx 通常会自动加载 `/var/www/html` 下的文件。
打开浏览器，输入您的 **公网 IP** (例如 `http://123.45.67.89`) 即可访问。

**如果是单页应用 (SPA) 路由问题优化：**
如果遇到刷新页面 404，请编辑 Nginx 配置：
`vim /etc/nginx/sites-available/default`

修改 `location /` 部分：
```nginx
location / {
    root /var/www/html;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```
保存并重启 Nginx: `systemctl restart nginx`

---

### 方式二：开发模式预览 (临时测试)

如果您只是想在服务器上临时运行代码进行调试，可以使用 Vite 的预览模式。

1.  **配置安全组**: 在阿里云控制台开放 **3000** 端口 (或您自定义的端口)。
2.  **服务器安装 Node.js**: 确保服务器安装了 Node.js (v18+)。
3.  **上传源码**: 将除了 `node_modules` 和 `dist` 之外的所有文件上传到服务器。
4.  **安装依赖并运行**:

```bash
# 在服务器项目目录下
npm install

# 启动开发服务器 (注意 --host 参数)
npm run dev -- --host
```

5.  **访问**: 浏览器访问 `http://<您的公网IP>:3000`。

> **注意**: 此方式仅供开发调试，不建议用于生产环境，因为断开 SSH 连接后服务会停止（除非使用 `nohup` 或 `pm2`）。

---

## 关于数据存储

本项目采用 **IndexedDB** 进行数据存储：
- 所有数据（库存、历史记录、API Key）都保存在**访问者的浏览器**中。
- 更换电脑或浏览器需要先在旧设备点击“备份数据”，并在新设备“导入表格/恢复数据”。
- 服务器端（Nginx）仅负责分发页面，不存储任何业务数据。
