// 百度网盘开放平台配置
const BAIDU_PAN_CONFIG = {
    // 你的应用信息
    APP_ID: '119792135',
    APP_KEY: 'ynJiKcmV5InpSvn2dXvlfq10tu0zJouy',
    SECRET_KEY: 'dHObGtFtRJvEPIJobseqt7MIDrsaTE82',
    SIGN_KEY: 'Nw#SpZWc-kswoZqw=LNzz5IAFsxaTF7+',
    
    // OAuth授权相关
    AUTH_URL: 'https://openapi.baidu.com/oauth/2.0/authorize',
    TOKEN_URL: 'https://openapi.baidu.com/oauth/2.0/token',
    
    // 百度网盘API
    PAN_API_BASE: 'https://pan.baidu.com/rest/2.0/xpan',
    
    // 回调地址 - 这里使用当前域名
    REDIRECT_URI: window.location.origin + window.location.pathname,
    
    // 授权范围
    SCOPE: 'basic,netdisk',
    
    // 响应类型
    RESPONSE_TYPE: 'code',
    
    // 授权码有效期（秒）
    AUTH_CODE_EXPIRE: 600,
    
    // 访问令牌有效期（秒）
    ACCESS_TOKEN_EXPIRE: 2592000, // 30天
    
    // 刷新令牌有效期（秒）
    REFRESH_TOKEN_EXPIRE: 31536000 // 1年
};

// 百度网盘API接口类
class BaiduPanAPI {
    constructor() {
        this.config = BAIDU_PAN_CONFIG;
        this.accessToken = localStorage.getItem('baidu_pan_access_token');
        this.refreshToken = localStorage.getItem('baidu_pan_refresh_token');
        this.tokenExpireTime = parseInt(localStorage.getItem('baidu_pan_token_expire')) || 0;
        this.userInfo = JSON.parse(localStorage.getItem('baidu_pan_user_info') || 'null');
    }
    
    // 生成授权URL
    generateAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.config.APP_ID,
            response_type: this.config.RESPONSE_TYPE,
            redirect_uri: this.config.REDIRECT_URI,
            scope: this.config.SCOPE,
            display: 'popup',
            state: this.generateState()
        });
        
        return `${this.config.AUTH_URL}?${params.toString()}`;
    }
    
    // 生成随机state参数
    generateState() {
        const state = Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('baidu_pan_state', state);
        return state;
    }
    
    // 验证state参数
    validateState(state) {
        const savedState = sessionStorage.getItem('baidu_pan_state');
        return state === savedState;
    }
    
    // 处理授权回调
    async handleAuthCallback(code, state) {
        if (!this.validateState(state)) {
            throw new Error('State验证失败');
        }
        
        try {
            const tokenData = await this.exchangeCodeForToken(code);
            this.saveTokens(tokenData);
            return tokenData;
        } catch (error) {
            console.error('获取访问令牌失败:', error);
            throw error;
        }
    }
    
    // 用授权码换取访问令牌
    async exchangeCodeForToken(code) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: this.config.APP_ID,
            client_secret: this.config.SECRET_KEY,
            redirect_uri: this.config.REDIRECT_URI
        });
        
        const response = await fetch(this.config.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        
        if (!response.ok) {
            throw new Error(`获取令牌失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`百度API错误: ${data.error_description || data.error}`);
        }
        
        return data;
    }
    
    // 保存令牌信息
    saveTokens(tokenData) {
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.tokenExpireTime = Date.now() + (tokenData.expires_in * 1000);
        
        localStorage.setItem('baidu_pan_access_token', this.accessToken);
        localStorage.setItem('baidu_pan_refresh_token', this.refreshToken);
        localStorage.setItem('baidu_pan_token_expire', this.tokenExpireTime.toString());
    }
    
    // 检查令牌是否有效
    isTokenValid() {
        return this.accessToken && Date.now() < this.tokenExpireTime;
    }
    
    // 刷新访问令牌
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('没有刷新令牌');
        }
        
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
            client_id: this.config.APP_ID,
            client_secret: this.config.SECRET_KEY
        });
        
        const response = await fetch(this.config.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        
        if (!response.ok) {
            throw new Error(`刷新令牌失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`百度API错误: ${data.error_description || data.error}`);
        }
        
        this.saveTokens(data);
        return data;
    }
    
    // 获取用户信息
    async getUserInfo() {
        if (!this.isTokenValid()) {
            await this.refreshAccessToken();
        }
        
        const response = await fetch(`${this.config.PAN_API_BASE}/user?access_token=${this.accessToken}&method=info`);
        
        if (!response.ok) {
            throw new Error(`获取用户信息失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errno !== 0) {
            throw new Error(`百度API错误: ${data.errmsg}`);
        }
        
        this.userInfo = data.result;
        localStorage.setItem('baidu_pan_user_info', JSON.stringify(this.userInfo));
        return this.userInfo;
    }
    
    // 获取文件列表
    async getFileList(dir = '/', start = 0, limit = 100, order = 'name', desc = 0) {
        if (!this.isTokenValid()) {
            await this.refreshAccessToken();
        }
        
        const params = new URLSearchParams({
            access_token: this.accessToken,
            method: 'list',
            dir: dir,
            start: start.toString(),
            limit: limit.toString(),
            order: order,
            desc: desc.toString()
        });
        
        const response = await fetch(`${this.config.PAN_API_BASE}/file?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`获取文件列表失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errno !== 0) {
            throw new Error(`百度API错误: ${data.errmsg}`);
        }
        
        return data.result;
    }
    
    // 搜索文件
    async searchFiles(keyword, dir = '/', start = 0, limit = 100) {
        if (!this.isTokenValid()) {
            await this.refreshAccessToken();
        }
        
        const params = new URLSearchParams({
            access_token: this.accessToken,
            method: 'search',
            key: keyword,
            dir: dir,
            start: start.toString(),
            limit: limit.toString()
        });
        
        const response = await fetch(`${this.config.PAN_API_BASE}/file?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`搜索文件失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errno !== 0) {
            throw new Error(`百度API错误: ${data.errmsg}`);
        }
        
        return data.result;
    }
    
    // 获取文件下载链接
    async getFileDownloadUrl(filePath) {
        if (!this.isTokenValid()) {
            await this.refreshAccessToken();
        }
        
        const params = new URLSearchParams({
            access_token: this.accessToken,
            method: 'download',
            path: filePath
        });
        
        const response = await fetch(`${this.config.PAN_API_BASE}/multimedia?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`获取下载链接失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errno !== 0) {
            throw new Error(`百度API错误: ${data.errmsg}`);
        }
        
        return data.result;
    }
    
    // 获取文件信息
    async getFileInfo(filePath) {
        if (!this.isTokenValid()) {
            await this.refreshAccessToken();
        }
        
        const params = new URLSearchParams({
            access_token: this.accessToken,
            method: 'filemetas',
            fsids: `[${filePath}]`,
            dlink: '1'
        });
        
        const response = await fetch(`${this.config.PAN_API_BASE}/multimedia?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`获取文件信息失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errno !== 0) {
            throw new Error(`百度API错误: ${data.errmsg}`);
        }
        
        return data.result;
    }
    
    // 登出
    logout() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpireTime = 0;
        this.userInfo = null;
        
        localStorage.removeItem('baidu_pan_access_token');
        localStorage.removeItem('baidu_pan_refresh_token');
        localStorage.removeItem('baidu_pan_token_expire');
        localStorage.removeItem('baidu_pan_user_info');
        sessionStorage.removeItem('baidu_pan_state');
    }
    
    // 检查是否已登录
    isLoggedIn() {
        return this.isTokenValid();
    }
}

// 导出配置和API类
window.BAIDU_PAN_CONFIG = BAIDU_PAN_CONFIG;
window.BaiduPanAPI = BaiduPanAPI;
