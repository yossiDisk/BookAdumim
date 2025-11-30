const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store sessions per client with initialization status
const sessions = new Map();

function getClientId(req) {
    return req.ip || req.connection.remoteAddress || 'default';
}

// Initialize session by making a GET request first
async function initializeSession(clientId) {
    console.log(`🔄 Initializing session for client: ${clientId}`);
    
    try {
        const response = await axios.get(
            'https://maale-adummim.libraries.co.il/BuildaGate5library/general2/company_search_tree.php',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none'
                },
                maxRedirects: 5,
                validateStatus: () => true
            }
        );
        
        console.log(`   GET Status: ${response.status}, Size: ${response.data.length} chars`);
        
        // Check for cookie (case insensitive)
        let cookieHeader = null;
        for (const [key, value] of Object.entries(response.headers)) {
            if (key.toLowerCase() === 'set-cookie') {
                cookieHeader = value;
                break;
            }
        }
        
        if (cookieHeader) {
            const cookie = (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader])
                .map(c => c.split(';')[0])
                .join('; ');
            
            sessions.set(clientId, {
                cookie: cookie,
                initialized: true,
                timestamp: Date.now()
            });
            
            console.log(`✅ Session initialized with cookie: ${cookie.substring(0, 50)}...`);
            return cookie;
        } else {
            console.log('⚠️  No cookie received during initialization');
            console.log('   Headers:', Object.keys(response.headers));
            return null;
        }
    } catch (error) {
        console.error('❌ Failed to initialize session:', error.message);
        return null;
    }
}

app.all('*', async (req, res) => {
    const targetUrl = `https://maale-adummim.libraries.co.il${req.path}`;
    const clientId = getClientId(req);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log(`👤 Client: ${clientId}`);
    
    try {
        // Only initialize session for POST to company_search_tree.php
        const needsSession = req.method === 'POST' && req.path.includes('company_search_tree.php');
        
        let sessionData = null;
        
        if (needsSession) {
            console.log(`🔐 This endpoint requires session`);
            
            // Check if client has an initialized session
            sessionData = sessions.get(clientId);
            
            // Initialize session if needed (or if expired - 30 min)
            if (!sessionData || 
                !sessionData.initialized || 
                (Date.now() - sessionData.timestamp > 30 * 60 * 1000)) {
                
                const cookie = await initializeSession(clientId);
                if (!cookie) {
                    throw new Error('Failed to initialize session');
                }
                sessionData = sessions.get(clientId);
            }
            
            console.log(`🍪 Using session cookie: ${sessionData.cookie.substring(0, 40)}...`);
        } else {
            console.log(`🔓 No session required for this endpoint`);
        }
        
        // Build headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
        };
        
        // Add session-specific headers only if needed
        if (needsSession && sessionData) {
            headers['Cookie'] = sessionData.cookie;
            headers['Referer'] = 'https://maale-adummim.libraries.co.il/BuildaGate5library/general2/company_search_tree.php';
            headers['Origin'] = 'https://maale-adummim.libraries.co.il';
            headers['Sec-Fetch-User'] = '?1';
            headers['Upgrade-Insecure-Requests'] = '1';
        }
        
        // Add Content-Type only for POST
        if (req.method === 'POST') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        
        // Convert body to URL-encoded string
        let postData = req.body;
        if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            const params = new URLSearchParams();
            Object.entries(req.body).forEach(([key, value]) => {
                params.append(key, value);
            });
            postData = params.toString();
            console.log(`📤 Sending ${postData.length} chars as URL-encoded data`);
        }
        
        // Build full URL with query string for GET requests
        let fullUrl = targetUrl;
        if (req.method === 'GET' && Object.keys(req.query).length > 0) {
            const queryString = new URLSearchParams(req.query).toString();
            fullUrl = `${targetUrl}?${queryString}`;
            console.log(`🔗 Full URL: ${fullUrl}`);
        }
        
        // Make the request
const response = await axios({
            method: req.method,
            url: fullUrl,
            data: postData,
            headers: headers,
            maxRedirects: 5,
            validateStatus: () => true,
            // 🎯 תיקון #1: ודא ש-axios יודע לשלוח נתונים בינאריים נכון
            responseType: req.path.includes('imagesP/') ? 'arraybuffer' : 'text',
            decompress: true
        });
        
        // 🎯 תיקון #2: טיפול נכון בגודל ה-Buffer
        const responseData = response.data;
        const responseSize = Buffer.isBuffer(responseData) ? Buffer.byteLength(responseData) : responseData.length;
        
        console.log(`✅ Response: ${response.status} ${response.statusText}`);
        console.log(`📦 Size: ${responseSize} bytes`);
        
        // Check response content
        const hasResults = response.data.includes('trsrcres');
        const hasSearchForm = response.data.includes('SearchFildType_1');
        const hasLogin = response.data.includes('loginForm') || response.data.includes('LoginPanel');
        
        console.log(`📊 Analysis:`);
        console.log(`   Has results: ${hasResults ? '✅' : '❌'}`);
        console.log(`   Has search form: ${hasSearchForm ? '✅' : '❌'}`);
        console.log(`   Has login page: ${hasLogin ? '⚠️' : '✅'}`);
        
        // Update cookie if new one received
        if (response.headers['set-cookie']) {
            const newCookie = response.headers['set-cookie']
                .map(c => c.split(';')[0])
                .join('; ');
            
            sessions.set(clientId, {
                cookie: newCookie,
                initialized: true,
                timestamp: Date.now()
            });
            
            console.log(`🍪 Updated cookie: ${newCookie.substring(0, 40)}...`);
        }
        
res.status(response.status);
        
        // 🎯 תיקון #3: הוספת CORS ידנית (חובה ב-Proxy שמשכתב תגובות)
        res.set('Access-Control-Allow-Origin', '*'); 
        
        Object.keys(response.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            // עלינו להעביר את Content-Type, Content-Length ואת כל הכותרות של התמונה!
            if (lowerKey !== 'set-cookie' && 
                lowerKey !== 'transfer-encoding' &&
                lowerKey !== 'content-encoding') { 
                res.set(key, response.headers[key]);
            }
        });
        
        console.log(`${'='.repeat(80)}\n`);
        
        // 🎯 תיקון #4: שליחת ה-Buffer/טקסט שהתקבל
        res.send(response.data); 
        
    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        res.status(500).json({ 
            error: 'Proxy error', 
            message: error.message
        });
    }
});

// Clean up old sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [clientId, session] of sessions.entries()) {
        if (now - session.timestamp > 30 * 60 * 1000) {
            sessions.delete(clientId);
            console.log(`🧹 Cleaned up expired session for: ${clientId}`);
        }
    }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║   🚀 Proxy Server with Session Init           ║
╟────────────────────────────────────────────────╢
║   📍 Local:  http://localhost:${PORT}            ║
║   🔗 Target: maale-adummim.libraries.co.il    ║
║   🍪 Cookie: Auto-initialized per client      ║
║   ⏱️  Session: 30 min expiry                   ║
╚════════════════════════════════════════════════╝
`);
    console.log('Ready to proxy requests...\n');
});