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
        const paramString = this.getRequestParamString(params);
        const signString = this.apiKey + timestamp + paramString;
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

            const endTime = Date.now();
            const startTime = endTime - (90 * 24 * 60 * 60 * 1000);

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

            if (allPositions.length > 0) {
                console.log('Successfully retrieved positions:');
                allPositions.forEach(position => {
                    console.log({
                        positionId: position.positionId,
                        symbol: position.symbol,
                        positionType: position.positionType === 1 ? 'LONG' : 'SHORT',
                        openType: position.openType === 1 ? 'ISOLATED' : 'CROSS',
                        state: position.state,
                        holdVol: position.holdVol,
                        frozenVol: position.frozenVol,
                        closeVol: position.closeVol,
                        holdAvgPrice: position.holdAvgPrice,
                        openAvgPrice: position.openAvgPrice,
                        closeAvgPrice: position.closeAvgPrice,
                        liquidatePrice: position.liquidatePrice,
                        oim: position.oim,
                        im: position.im,
                        holdFee: position.holdFee,
                        realised: position.realised,
                        adlLevel: position.adlLevel,
                        leverage: position.leverage,
                        createTime: new Date(position.createTime).toLocaleString(),
                        updateTime: new Date(position.updateTime).toLocaleString(),
                        autoAddIm: position.autoAddIm
                    });
                    console.log('-------------------');
                });

                const summary = allPositions.reduce((acc, pos) => ({
                    totalPositions: acc.totalPositions + 1,
                    totalPnL: acc.totalPnL + parseFloat(pos.realised || 0),
                    totalFees: acc.totalFees + parseFloat(pos.holdFee || 0)
                }), {
                    totalPositions: 0,
                    totalPnL: 0,
                    totalFees: 0
                });

                console.log('\nSummary:');
                console.log(`Total Positions: ${summary.totalPositions}`);
                console.log(`Total P&L: ${summary.totalPnL.toFixed(4)} USDT`);
                console.log(`Total Fees: ${summary.totalFees.toFixed(4)} USDT`);
                console.log(`Net P&L: ${(summary.totalPnL - summary.totalFees).toFixed(4)} USDT`);
            }

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

    async getOrderHistory(options = {}) {
        try {
            const endpoint = '/api/v1/private/order/list/history_orders';
            const pageSize = 100;
            let allOrders = [];
            let currentPage = 1;
            let hasMoreData = true;

            const endTime = Date.now();
            const startTime = endTime - (90 * 24 * 60 * 60 * 1000);

            console.log('\nFetching orders:');
            console.log('From:', new Date(startTime).toLocaleString());
            console.log('To:', new Date(endTime).toLocaleString(), '\n');

            while (hasMoreData) {
                const params = {
                    page_num: currentPage,
                    page_size: pageSize,
                    start_time: startTime,
                    end_time: endTime,
                    ...(options.symbol && { symbol: options.symbol }),
                    ...(options.states && { states: options.states }),
                    ...(options.category && { category: options.category }),
                    ...(options.side && { side: options.side })
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

                const orders = response.data.data;

                if (orders.length > 0) {
                    allOrders = allOrders.concat(orders);
                    console.log(`Fetched page ${currentPage}, got ${orders.length} orders`);
                    currentPage++;
                } else {
                    hasMoreData = false;
                }

                await new Promise(resolve => setTimeout(resolve, 300));
            }

            if (allOrders.length > 0) {
                console.log('\nDetailed Order Information:');
                allOrders.forEach(order => {
                    console.log({
                        orderId: order.orderId,
                        symbol: order.symbol,
                        positionId: order.positionId,
                        price: order.price,
                        vol: order.vol,
                        leverage: order.leverage,
                        side: order.side,
                        category: order.category,
                        orderType: order.orderType,
                        dealAvgPrice: order.dealAvgPrice,
                        dealVol: order.dealVol,
                        orderMargin: order.orderMargin,
                        takerFee: order.takerFee,
                        makerFee: order.makerFee,
                        profit: order.profit,
                        feeCurrency: order.feeCurrency,
                        openType: order.openType,
                        state: order.state,
                        errorCode: order.errorCode,
                        externalOid: order.externalOid,
                        usedMargin: order.usedMargin,
                        createTime: new Date(order.createTime).toLocaleString(),
                        updateTime: new Date(order.updateTime).toLocaleString(),
                        stopLossPrice: order.stopLossPrice,
                        takeProfitPrice: order.takeProfitPrice
                    });
                    console.log('-------------------');
                });

                const summary = allOrders.reduce((acc, order) => ({
                    totalOrders: acc.totalOrders + 1,
                    totalProfit: acc.totalProfit + parseFloat(order.profit || 0),
                    totalFees: acc.totalFees + 
                        parseFloat(order.takerFee || 0) + 
                        parseFloat(order.makerFee || 0)
                }), {
                    totalOrders: 0,
                    totalProfit: 0,
                    totalFees: 0
                });

                console.log('\nSummary:');
                console.log(`Total Orders: ${summary.totalOrders}`);
                console.log(`Total Profit: ${summary.totalProfit.toFixed(4)} USDT`);
                console.log(`Total Fees: ${summary.totalFees.toFixed(4)} USDT`);
                console.log(`Net Profit: ${(summary.totalProfit - summary.totalFees).toFixed(4)} USDT`);
            } else {
                console.log('No orders found');
            }

            return allOrders;
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
        console.log('Starting data fetch...');
        console.log('API Key:', process.env.MEXC_API_KEY ? 'Present' : 'Missing');
        console.log('API Secret:', process.env.MEXC_API_SECRET ? 'Present' : 'Missing');

        const client = new MexcClient();
        
        // Fetch position history
        await client.getPositionHistory({
            symbol: 'BTC_USDT'  // Optional: specify symbol
        });

        // Fetch order history
        await client.getOrderHistory({
            symbol: '',  // Optional: specify symbol
            states: '3,4',       // Optional: completed and cancelled orders
            category: 1,         // Optional: limit orders only
            side: 1             // Optional: open long orders only
        });

    } catch (error) {
        console.error('Failed to fetch data:', error.message);
    }
}

main();