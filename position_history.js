const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

class MexcClient {
    constructor() {
        this.apiKey = process.env.MEXC_API_KEY;
        this.apiSecret = process.env.MEXC_API_SECRET;
        this.baseUrl = 'https://contract.mexc.com';
    }

    urlEncode(str) {
        return encodeURIComponent(str).replace(/\!/g, '%21')
                                    .replace(/\'/g, '%27')
                                    .replace(/\(/g, '%28')
                                    .replace(/\)/g, '%29')
                                    .replace(/\*/g, '%2A')
                                    .replace(/\+/g, '%20');
    }

    getRequestParamString(params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        return Object.keys(params)
            .sort()
            .map(key => {
                const value = params[key] === null || params[key] === undefined ? '' : params[key];
                return `${key}=${this.urlEncode(value.toString())}`;
            })
            .join('&');
    }

    generateSignature(timestamp, params = {}) {
        // Get sorted parameter string
        const paramString = this.getRequestParamString(params);
        
        // Create signature string: accessKey + timestamp + paramString
        const signString = this.apiKey + timestamp + paramString;
        
        console.log('Param string:', paramString);
        console.log('Sign string:', signString);

        // Generate HMAC SHA256 signature
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(signString)
            .digest('hex');
    }

    async getPositionHistory(options = {}) {
        try {
            const endpoint = '/api/v1/private/position/list/history_positions';
            const timestamp = Date.now().toString();
            
            // Prepare parameters
            const params = {
                page_num: options.pageNum || 1,
                page_size: options.pageSize || 20,
                ...(options.symbol && { symbol: options.symbol }),
                ...(options.type && { type: options.type })
            };

            // Generate signature
            const signature = this.generateSignature(timestamp, params);

            console.log('Request details:', {
                url: `${this.baseUrl}${endpoint}`,
                params: params,
                headers: {
                    'Content-Type': 'application/json',
                    //'ApiKey': this.apiKey,
                    'Request-Time': timestamp,
                    'Signature': signature
                }
            });

            const response = await axios({
                method: 'GET',
                url: `${this.baseUrl}${endpoint}`,
                params: params,
                headers: {
                    'Content-Type': 'application/json',
                    'ApiKey': this.apiKey,
                    'Request-Time': timestamp,
                    'Signature': signature,
                    'Recv-Window': '60000'
                }
            });

            if (!response.data.success) {
                throw new Error(`API Error: ${response.data.message || 'Unknown error'}`);
            }

            return response.data.data;
        } catch (error) {
            console.error('API Error Details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers
            });
            throw error;
        }
    }
}

async function main() {
    try {
        console.log('Starting position history fetch...');
        console.log('API Key:', process.env.MEXC_API_KEY ? 'Present' : 'Missing');
        console.log('API Secret:', process.env.MEXC_API_SECRET ? 'Present' : 'Missing');

        const client = new MexcClient();
        const positions = await client.getPositionHistory({
            symbol: 'BTC_USDT',  // Try with a specific symbol
            pageSize: 10
        });
        
        if (positions && positions.length > 0) {
            console.log('Successfully retrieved positions:');
            let totalPnL = 0;
            
            positions.forEach(position => {
                totalPnL += parseFloat(position.realised);
                console.log({
                    positionId: position.positionId,
                    symbol: position.symbol,
                    positionType: position.positionType === 1 ? 'LONG' : 'SHORT',
                    openType: position.openType === 1 ? 'ISOLATED' : 'CROSS',
                    state: position.state,
                    holdVol: position.holdVol,
                    openAvgPrice: position.openAvgPrice,
                    closeAvgPrice: position.closeAvgPrice,
                    leverage: position.leverage,
                    realised: position.realised,
                    holdFee: position.holdFee,
                    createTime: new Date(position.createTime).toLocaleString(),
                    updateTime: new Date(position.updateTime).toLocaleString()
                });
            });
            
            console.log('\nSummary:');
            console.log(`Total Positions: ${positions.length}`);
            console.log(`Total P&L: ${totalPnL.toFixed(4)} USDT`);
        } else {
            console.log('No positions found');
        }
    } catch (error) {
        console.error('Failed to fetch position history:', error.message);
    }
}

main(); 