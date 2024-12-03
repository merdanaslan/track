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
        
        // Generate HMAC SHA256 signature
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(signString)
            .digest('hex');
    }

    async getPositionHistory(options = {}) {
        try {
            const endpoint = '/api/v1/private/position/list/history_positions';
            const pageSize = 100;
            let allPositions = [];
            let currentPage = 1;
            let hasMoreData = true;

            // Calculate date range for 90 days (maximum allowed)
            const endTime = Date.now();
            const startTime = endTime - (90 * 24 * 60 * 60 * 1000); // 90 days in milliseconds

            console.log('\nFetching positions:');
            console.log('From:', new Date(startTime).toLocaleString());
            console.log('To:', new Date(endTime).toLocaleString(), '\n');

            while (hasMoreData) {
                const params = {
                    page_num: currentPage,
                    page_size: pageSize,
                    ...(options.symbol && { symbol: options.symbol }),
                    start_time: startTime,
                    end_time: endTime
                };

                const timestamp = Date.now().toString();
                const signature = this.generateSignature(timestamp, params);

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

                const positions = response.data.data;

                if (positions.length > 0) {
                    allPositions = allPositions.concat(positions);
                    currentPage++;
                } else {
                    hasMoreData = false;
                }

                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Sort positions by date (newest first)
            allPositions.sort((a, b) => b.createTime - a.createTime);

            return allPositions;
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
            symbol: '',  // Try with a specific symbol
            pageSize: 10
        });
        
        if (positions && positions.length > 0) {
            console.log('\nDetailed Position Information:');
            positions.forEach(position => {
                console.log({
                    // Basic Position Info
                    positionId: position.positionId,
                    symbol: position.symbol,
                    positionType: position.positionType === 1 ? 'LONG' : 'SHORT',
                    openType: position.openType === 1 ? 'ISOLATED' : 'CROSS',
                    state: translateState(position.state),
                    
                    // Volume Information
                    holdVol: position.holdVol,
                    frozenVol: position.frozenVol,
                    closeVol: position.closeVol,
                    
                    // Price Information
                    holdAvgPrice: position.holdAvgPrice,
                    openAvgPrice: position.openAvgPrice,
                    closeAvgPrice: position.closeAvgPrice,
                    liquidatePrice: position.liquidatePrice,
                    
                    // Margin Information
                    originalInitialMargin: position.oim,
                    initialMargin: position.im,
                    leverage: position.leverage + 'x',
                    autoAddMargin: position.autoAddIm,
                    
                    // P&L and Fees
                    holdingFee: position.holdFee,
                    realizedPnL: position.realised,
                    
                    // Additional Info
                    adlLevel: position.adlLevel,
                    
                    // Timestamps
                    createTime: new Date(position.createTime).toLocaleString(),
                    updateTime: new Date(position.updateTime).toLocaleString()
                });
                console.log('-------------------');
            });

            // Enhanced summary
            const summary = positions.reduce((acc, pos) => {
                return {
                    totalPositions: acc.totalPositions + 1,
                    totalPnL: acc.totalPnL + parseFloat(pos.realised),
                    totalFees: acc.totalFees + parseFloat(pos.holdFee),
                    longPositions: acc.longPositions + (pos.positionType === 1 ? 1 : 0),
                    shortPositions: acc.shortPositions + (pos.positionType === 2 ? 1 : 0)
                };
            }, {
                totalPositions: 0,
                totalPnL: 0,
                totalFees: 0,
                longPositions: 0,
                shortPositions: 0
            });

            console.log('\nSummary:');
            console.log(`Total Positions: ${summary.totalPositions}`);
            console.log(`Long Positions: ${summary.longPositions}`);
            console.log(`Short Positions: ${summary.shortPositions}`);
            console.log(`Total P&L: ${summary.totalPnL.toFixed(4)} USDT`);
            console.log(`Total Fees: ${summary.totalFees.toFixed(4)} USDT`);
            console.log(`Net P&L: ${(summary.totalPnL - summary.totalFees).toFixed(4)} USDT`);
        } else {
            console.log('No positions found');
        }
    } catch (error) {
        console.error('Failed to fetch position history:', error.message);
    }
}

// Helper function to translate state codes
function translateState(state) {
    switch(state) {
        case 1: return 'HOLDING';
        case 2: return 'SYSTEM AUTO-HOLDING';
        case 3: return 'CLOSED';
        default: return 'UNKNOWN';
    }
}

main(); 