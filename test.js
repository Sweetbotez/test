process.on("unhandledRejection", (reason, promise) => {
    console.log("Unhandled Rejection at:", promise, "reason:", reason);
    // Application specific logging, throwing an error, or other logic here
});
//------------------------------------------------------------------------------------------------------

const Web3 = require("web3");
// 首先我们定义一个交易对事件列表用来暂存新的交易对事件
let eventQueue = [];
// 初始化一个标志位为false
let isProcessing = false;
// 引入mysql库
const mysql = require('mysql2');
const Web3WsProvider = require("web3-providers-ws");
const TelegramBot = require("node-telegram-bot-api"); // 添加这行
const axios = require("axios");
const Bottleneck = require("bottleneck");
//------------------------------------------------------------------------------------------------------
// 创建连接池
const pool = mysql.createPool({
    host: "localhost", // 数据库的主机名
    user: "8909284433", // 数据库的用户名
    password: "ydzpHcxrChpPKaFM", // 数据库的密码
    database: "nhoundbot", // 要连接的数据库名
    waitForConnections: true, // 如果没有可用连接，是否等待。默认为true
    connectionLimit: 10, // 连接池中可以存放的最大连接数量。默认为10
    queueLimit: 0 // 限制连接池中排队等待的连接数量。如果设置为0，就没有限制。默认为0
});

// 使用promisePool.query来运行SQL查询
const promisePool = pool.promise();

// 创建一个新的SQL语句来创建表
const sqlCreateTable = `
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL
    )`;

// 执行SQL语句
promisePool.query(sqlCreateTable)
    .then(([rows, fields]) => {
        // 执行成功后在控制台输出消息
        console.log("已成功创建表!");
    })
    .catch(err => {
        // 如果执行时发生错误，打印错误信息
        console.error("Error creating table: ", err);
    });
//------------------------------------------------------------------------------------------------
// 定义fromBaseUnit函数
function fromBaseUnit(value, decimals) {
    return value / Math.pow(10, decimals);
}
//------------------------------------------------------------------------------------------------------

// 创建一个限速器，每秒最多发送10个请求，目前没用到
const limiter = new Bottleneck({
    minTime: 100, // 毫秒
});


//------------------------------------------------------------------------------------------------------
// 你的Telegram机器人令牌
const token = '6074925749:AAEi47kXvoYk5Z4iu6aakgtAy5VSukK4hX8';
// 创建一个新的Telegram机器人实例
const bot = new TelegramBot(token, { polling: true });
// 你的Telegram群组ID
const chatId = '-1001927270802';
// 发送消息至群组
bot.sendMessage(chatId, 'Hello from Uniswap bot!');
//----------------------------------------------------------------------------------------------------




// //V3定义ABI
const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; // 这只是一个示例地址，请使用实际的Uniswap V3工厂合约地址
const UNISWAP_V3_FACTORY_ABI = require("./UniV3ABI/UniswapV3Factory.json"); // 你需要从Uniswap的GitHub仓库或其他地方获取正确的ABI
const UNISWAP_V3_POOL_ABI = require("./UniV3ABI/UniswapV3pool.json"); // 你需要从Uniswap的GitHub仓库或其他地方获取正确的ABI
const ERC20_ABI = require("./UniV2ABI/ERC20.json"); // ERC20的ABI应该保持不变

//------------------------------------------------------------------------------------------------------

// 创建一个自动重连的Websocket提供程序
const wsProvider = new Web3WsProvider(
    "wss://eth-mainnet.g.alchemy.com/v2/4CggayU2Ui2aF6OjIhqGsKPUYqBe5b_D", {
        reconnect: {
            auto: true,
            delay: 5000, // 尝试重新连接前的等待时间
            maxAttempts: 50000000000, // 最大重连尝试次数
            onTimeout: false,
        },
    }
);
//------------------------------------------------------------------------------------------------------
//创建WEB3实例
const web3 = new Web3(wsProvider);
const factoryContract = new web3.eth.Contract(UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_FACTORY_ADDRESS);
//------------------------------------------------------------------------------------------------------

// 定时发送心跳包，每10秒获取一次最新的区块号
setInterval(async function() {
    try {
        const blockNumber = await web3.eth.getBlockNumber();
        console.log('Current block number:', blockNumber);
    } catch (error) {
        console.error("Error on heartbeat:", error);
    }
}, 10000);
//------------------------------------------------------------------------------------------------------

// 每分钟检查一次列表中是否有事件需要处理
setInterval(() => {
    const currentTime = Date.now();
    if (
        eventQueue.length > 0 &&
        currentTime - eventQueue[0].time >= 2 * 60 * 1000
    ) {
        // 检查事件是否已经过了5分钟
        if (!isProcessing) {
            // 检查processEvent函数是否正在执行
            const event = eventQueue.shift(); // 弹出列表中的第一个事件
            processEvent(event); // 处理事件
        }
    }
}, 1 * 1000);
//------------------------------------------------------------------------------------------------------

// 定义getTokenHoldersCount函数获取持币地址2.0全部持有人数据
async function getTokenHoldersCount(contract_address) {
    let api_key = "cqt_rQhX4RCfMdtm74j8YgF9XJCpRgDF"; // 你的API密钥

    // 初始化持有人集合和页码
    let holders = new Set();
    let page_number = 0;

    while (true) {
        // 构造API请求地址
        let url = `https://api.covalenthq.com/v1/1/tokens/${contract_address}/token_holders/?page-number=${page_number}&key=${api_key}`;

        try {
            // 发送GET请求
            let response = await axios.get(url);
            // 获取持有人数据
            let holdersData = response.data.data.items;
            // 将新的持有人添加到集合中
            holdersData.forEach((holder) => holders.add(holder.address));

            // 检查是否还有更多的页面
            if (!response.data.data.pagination.has_more) {
                break;
            }

            // 增加页码以获取下一页的数据
            page_number++;
        } catch (error) {
            console.error(`Unable to retrieve token holders: ${error}`);
            break;
        }
    }

    // 返回持有人数量
    return holders.size;
}
//------------------------------------------------------------------------------------------------------

//获取代币交易量、代币价格、FDV、买卖笔数
async function getTokenData(tokenAddress) {
    try {
        // 构造API请求地址
        let url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;

        // 发送GET请求
        let response = await axios.get(url);

        // 获取代币数据
        let tokenData = response.data.pairs[0];

        // 提取需要的数据
        let priceUsd = tokenData.priceUsd;
        let buytxns = tokenData.txns.h1.buys;
        let selltxns = tokenData.txns.h1.sells;
        let volume = tokenData.volume.h1;
        let fdv = tokenData.fdv;
        let liquidity = tokenData.liquidity.usd
        let liquidityv1 = parseFloat(liquidity) / 2

        // 返回需要的数据
        return {
            priceUsd: priceUsd,
            buytxns: buytxns,
            selltxns: selltxns,
            volume: volume,
            fdv: fdv,
            liquidityv1: liquidityv1
        };
    } catch (error) {
        console.error(`Unable to retrieve token data: ${error}`);
    }
}
//------------------------------------------------------------------------------------------------------


//获取合约数据
async function GetTokenContractData(contractAddress) {
    try {
        let contractAddress2 = contractAddress;
        // 构造API请求地址
        let url = `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${contractAddress2}`;

        // 发送GET请求
        let response = await axios.get(url);
        //将Contract Address换成小写查询API数据
        let lowerCaseContractAddress = contractAddress2.toLowerCase();

        // 获取代币数据
        let tokenData = response.data.result[lowerCaseContractAddress];

        // 提取需要的数据
        // 提取购买税费@@@@@
        let buyTax = tokenData.buy_tax;
        // 提取出售税费@@@@@
        let sellTax = tokenData.sell_tax;
        // 提取是否可以购买的信息
        let cannotBuy = tokenData.cannot_buy;
        // 提取是否可以出售所有代币的信息@@@@@
        let cannotSellAll = tokenData.cannot_sell_all;
        // 提取是否可以修改滑点的信息@@@@@
        let slippageModifiable = tokenData.slippage_modifiable;
        // 提取是否是蜜罐的信息@@@@@
        let isHoneypot = tokenData.is_honeypot;
        // 提取是否可以暂停交易的信息@@@@@
        let transferPausable = tokenData.transfer_pausable;
        // 提取是否在黑名单的信息@@@@@
        let isBlacklisted = tokenData.is_blacklisted;
        // 提取是否在白名单的信息
        let isWhitelisted = tokenData.is_whitelisted;
        // 提取是否在去中心化交易所交易的信息
        let isInDex = tokenData.is_in_dex;
        // 提取在哪个去中心化交易所交易的信息
        let dex = tokenData.dex;
        // 提取是否有防鲸鱼机制的信息
        let isAntiWhale = tokenData.is_anti_whale;
        // 提取是否可以修改防鲸鱼机制的信息
        let antiWhaleModifiable = tokenData.anti_whale_modifiable;
        // 提取交易冷却时间的信息@@@@@
        let tradingCooldown = tokenData.trading_cooldown;
        // 提取是否可以为每个指定的地址设置不同的滑点的信息@@@@@
        let personalSlippageModifiable = tokenData.personal_slippage_modifiable;
        //是否为代理合约
        let ProxyContract = tokenData.is_proxy;
        //是否隐藏所有者
        let hidden = tokenData.hidden_owner;
        //是否增发
        let mintable = tokenData.is_mintable;

        //是否增发
        let mintableV1;
        if (mintable === "1") {
            mintableV1 = "✅"
        } else if (mintable === "0") {
            mintableV1 = "❎"
        } else {
            mintableV1 = "未知"
        }

        //是否隐藏所有者
        let hiddenV1;
        if (hidden === "1") {
            hiddenV1 = "✅"
        } else if (hidden === "0") {
            hiddenV1 = "❎"
        } else {
            hiddenV1 = "未知"
        }

        // 提取是否可以修改滑点的信息
        let slippageModifiableV1;
        if (slippageModifiable === "1") {
            slippageModifiableV1 = "✅"
        } else if (slippageModifiable === "0") {
            slippageModifiableV1 = "❎"
        } else {
            slippageModifiableV1 = "未知"
        }

        // 提取是否可以为每个指定的地址设置不同的滑点的信息
        let personalSlippageModifiableV1;
        if (personalSlippageModifiable === "1") {
            personalSlippageModifiableV1 = "✅"
        } else if (personalSlippageModifiable === "0") {
            personalSlippageModifiableV1 = "❎"
        } else {
            personalSlippageModifiableV1 = "未知"
        }

        // 提取是否可以出售所有代币的信息
        let cannotSellAllV1;
        if (cannotSellAll === "1") {
            cannotSellAllV1 = "✅"
        } else if (cannotSellAll === "0") {
            cannotSellAllV1 = "❎"
        } else {
            cannotSellAllV1 = "未知"
        }

        // 提取交易冷却时间的信息
        let tradingCooldownV1;
        if (tradingCooldown === "1") {
            tradingCooldownV1 = "✅"
        } else if (tradingCooldown === "0") {
            tradingCooldownV1 = "❎"
        } else {
            tradingCooldownV1 = "未知"
        }

        // 提取是否在黑名单的信息
        let isBlacklistedV1;
        if (isBlacklisted === "1") {
            isBlacklistedV1 = "✅"
        } else if (isBlacklisted === "0") {
            isBlacklistedV1 = "❎"
        } else {
            isBlacklistedV1 = "未知"
        }

        //逻辑判断代理合约数据输出
        let ProxyContractstatus;
        if (ProxyContract === "1") {
            ProxyContractstatus = "✅"
        } else if (ProxyContract === "0") {
            ProxyContractstatus = "❎"
        } else {
            ProxyContractstatus = "未知"
        }


        // 根据isHoneypot的值生成相应的字符串貔貅
        let honeypotStatus;
        if (isHoneypot === "1") {
            honeypotStatus = "✅";
        } else if (isHoneypot === "0") {
            honeypotStatus = "❎";
        } else {
            honeypotStatus = "未知";
        }

        //判断交易开关输出项
        let transferPausableV1;
        if (transferPausable === "1") {
            transferPausableV1 = "✅";
        } else if (transferPausable === "0") {
            transferPausableV1 = "❎";
        } else {
            transferPausableV1 = "未知";
        }

        //判断买入税费输出条件
        let moebuyTaxv1;
        if (buyTax === "1") {
            moebuyTaxv1 = "100";
        } else if (buyTax === "") {
            moebuyTaxv1 = "未知";
        } else if (buyTax === "0") {
            moebuyTaxv1 = "0"; // 或者任何你想设置的值
        } else {
            moebuyTaxv1 = parseFloat(buyTax) * 100 + "%";
        }

        //判断卖出税费输出条件
        let moesellTaxv1;
        if (sellTax === "1") {
            moesellTaxv1 = "100%";
        } else if (buyTax === "0") {
            moesellTaxv1 = "0"; // 或者任何你想设置的值
        } else if (sellTax === "") {
            moesellTaxv1 = "未知";
        } else {
            moesellTaxv1 = parseFloat(sellTax) * 100 + "%";
        }

        // 返回需要的数据
        return {
            mintableV1: mintableV1, //是否增发
            isBlacklistedV1: isBlacklistedV1, //黑名单
            hiddenV1: hiddenV1, //隐藏所有者
            tradingCooldownV1: tradingCooldownV1, //交易冷却
            cannotSellAllV1: cannotSellAllV1, //是否可出售所有代币
            personalSlippageModifiableV1: personalSlippageModifiableV1, // 提取是否可以为每个指定的地址设置不同的滑点的信息
            slippageModifiableV1: slippageModifiableV1, // 提取是否可以修改滑点的信息
            ProxyContractstatus: ProxyContractstatus, //是否为代理合约
            moebuyTaxv1: moebuyTaxv1, // 新添加的属性买入条件判断
            moesellTaxv1: moesellTaxv1, // 新添加的属性卖出条件判断
            transferPausableV1: transferPausableV1, // 新添加的属性 暂停交易监测
            honeypotStatus: honeypotStatus, // 新添加的属性 蜜罐监测
            buyTax: buyTax,
            sellTax: sellTax,
            cannotBuy: cannotBuy,
            cannotSellAll: cannotSellAll,
            slippageModifiable: slippageModifiable,
            isHoneypot: isHoneypot,
            transferPausable: transferPausable,
            isBlacklisted: isBlacklisted,
            isWhitelisted: isWhitelisted,
            isInDex: isInDex,
            dex: dex,
            isAntiWhale: isAntiWhale,
            antiWhaleModifiable: antiWhaleModifiable,
            tradingCooldown: tradingCooldown,
            personalSlippageModifiable: personalSlippageModifiable
        };
    } catch (error) {
        console.error(`Unable to retrieve token contract data: ${error}`);
    }
}

// v3监听PoolCreated事件
factoryContract.events.PoolCreated({}, async function(error, event) {
    try {
        if (error) {
            console.error('Error on PoolCreated', error);
            return;
        }

        // 将时间戳和事件一起添加到列表中
        const poolAddress = event.returnValues.pool;
        const poolContract = new web3.eth.Contract(UNISWAP_V3_POOL_ABI, poolAddress);

        const token0Address = await poolContract.methods.token0().call();
        const token1Address = await poolContract.methods.token1().call();

        // 获取交易对的储备信息
        const reserves = await poolContract.methods.getReserves().call();
        let reserve0 = reserves[0];
        let reserve1 = reserves[1];

        // 判断哪个是ETH的储备
        let reserveETH;
        if (token0Address.toLowerCase() === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase()) {
            reserveETH = reserve0;
        } else if (token1Address.toLowerCase() === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase()) {
            reserveETH = reserve1;
        } else {
            console.log("此交易对中没有ETH");
            return;
        }

        // 输出 ETH 储备量
        const reserveInETH = web3.utils.fromWei(reserveETH, "ether");

        // 将时间戳和事件一起添加到列表中
        eventQueue.push({
            time: Date.now(),
            event: event,
            initialReserveETH: reserveInETH, // 添加这一行
        });
    } catch (error) {
        console.error("Error in getReserves", error);
    }
});

//------------------------------------------------------------------------------------------------------

// 定义一个新的函数来处理事件，这个函数会在2分钟后被调用
async function processEvent(eventWrapper) {
    try {
        isProcessing = true; // 开始执行processEvent，设置标志位为true

        // ... 其他代码 ...
        const event = eventWrapper.event;

        // 在这里获取交易对信息的代码，就是你原来 PairCreated 事件监听里面的代码
        // 获取交易对的token0和token1

        // ...
        const pairAddress = event.returnValues.pair;
        const pairContract = new web3.eth.Contract(UNISWAP_PAIR_ABI, pairAddress);

        // 获取交易创建者地址
        const transaction = await web3.eth.getTransaction(event.transactionHash);
        const deployerAddress = transaction.from;

        // 获取创建者ETH余额
        const balanceWei = await web3.eth.getBalance(deployerAddress);
        const balanceEth = parseFloat(web3.utils.fromWei(balanceWei, "ether")).toFixed(2);

        const token0Address = await pairContract.methods.token0().call();
        const token1Address = await pairContract.methods.token1().call();

        const token0Contract = new web3.eth.Contract(ERC20_ABI, token0Address);
        const token1Contract = new web3.eth.Contract(ERC20_ABI, token1Address);

        const token0Name = await token0Contract.methods.name().call();
        const token0Symbol = await token0Contract.methods.symbol().call(); // 代币0的简称
        const token0TotalSupply = fromBaseUnit(
            await token0Contract.methods.totalSupply().call(),
            await token0Contract.methods.decimals().call()
        );
        // 代币0的总供应量

        const token1Name = await token1Contract.methods.name().call();
        const token1Symbol = await token1Contract.methods.symbol().call(); // 代币1的简称
        const token1TotalSupply = fromBaseUnit(
            await token1Contract.methods.totalSupply().call(),
            await token1Contract.methods.decimals().call()
        );
        // 代币1的总供应量

        // 检查是否为非ETH的配对代币
        let targetToken;
        if (
            token0Address.toLowerCase() ===
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase()
        ) {
            // 如果token0是WETH
            targetToken = {
                name: token1Name,
                symbol: token1Symbol,
                totalSupply: token1TotalSupply,
                address: token1Address,
            };
        } else {
            // 如果token0不是WETH，那么token1就必须是WETH
            targetToken = {
                name: token0Name,
                symbol: token0Symbol,
                totalSupply: token0TotalSupply,
                address: token0Address,
            };
        }

        // 获取交易对的储备信息
        const reserves = await pairContract.methods.getReserves().call();
        let reserveETH;
        if (
            token0Address.toLowerCase() ===
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase()
        ) {
            // 判断token0是否为WETH
            reserveETH = reserves._reserve0;
        } else if (
            token1Address.toLowerCase() ===
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase()
        ) {
            // 判断token1是否为WETH
            reserveETH = reserves._reserve1;
        } else {
            console.log("此交易对中没有ETH");
            isProcessing = false; // processEvent函数执行完毕，设置标志位为false
            return;
        }

        // 检查是否符合大于3ETH的流动性要求
        const reserveInETH = web3.utils.fromWei(reserveETH, "ether");
        const reserveETHv1 = parseFloat(reserveInETH).toFixed(2); //将流动性数量取小数点后两位
        if (reserveInETH > 1) {
            //------------------------------------------------------------------------------------------------------
            //检查合约是否开源
            const isContractOpenSource = async(contractAddress) => {
                const response = await axios.get(
                    `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=2EZNFH2PYSIX19MTQG2QAYP2SY6HZK2J79`
                );
                return response.data.result[0].SourceCode.trim() !== "";
            };

            const isTargetTokenOpenSource = await isContractOpenSource(
                targetToken.address
            );
            const openSourceStatus = isTargetTokenOpenSource ? "✅" : "❎";

            //const currentTime = new Date().toISOString(); // 获取当前时间并转换为ISO 8601格式的字符串
            const currentTime = new Date().toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
            });
            //初ETH数量
            const fasteth = parseFloat(eventWrapper.initialReserveETH).toFixed(2);
            // 获取持币人数量
            const holdersCount = await getTokenHoldersCount(targetToken.address);
            const holdersCountsize = parseInt(holdersCount, 10); //数字化持币人数
            //获取交易对被捕捉时的区块
            const blockNumber = eventWrapper.blockNumber;

            //获取交易对被延时5分钟播报时区块
            const currentBlockNumber = await web3.eth.getBlockNumber();

            //获取买卖交易笔数
            const tradesCount = await getTokenData(targetToken.address);
            const tradesCountbuy = parseInt(tradesCount.buytxns, 10); //数字化买入笔数
            const tradesCountsell = parseInt(tradesCount.selltxns, 10); //数字化卖出笔数
            //获取合约数据📊
            const tokenhydate = await GetTokenContractData(targetToken.address);
            // 将消息发送至Telegram群组
            //console.log(tradesCountbuy);

            if (holdersCountsize > 0 && tradesCountbuy > 1 && tradesCountsell > 0) {
                const message = `
# UniHound Bot提醒播报
## 代币信息
➡️🚨*来源*：Uniswap V2
        └─🔥*全称*：\`${targetToken.name}\`
        └─💎*简称*：\`${targetToken.symbol}\`
        └─🔹*合约*：\`${targetToken.address}\`
        └─🌈*总量*：${targetToken.totalSupply}
        └─🔎*DEV余额(e)*：${balanceEth}

## 交易信息
➡️💸*当前价格*：${tradesCount.priceUsd}(u)
        └─初始池子：${fasteth}(eth)
        └─现在池子：${reserveETHv1}(eth)
➡️📈*交易金额*：${tradesCount.volume}(u)
        └─流通市值：${tradesCount.fdv}(u)
➡️🕵️*持币人数*：${holdersCount}
        └─买卖笔数：${tradesCount.buytxns} / ${tradesCount.selltxns}

## 合约信息
➡️⛽️*税费*：${tokenhydate.moebuyTaxv1} / ${tokenhydate.moesellTaxv1}
        └─修改税费：${tokenhydate.slippageModifiableV1}
        └─指定税费：${tokenhydate.personalSlippageModifiableV1}
➡️📢*开源*：${openSourceStatus}
        └─代理合约：${tokenhydate.ProxyContractstatus}
        └─隐藏地址：${tokenhydate.hiddenV1}
➡️🤑*貔貅*：${tokenhydate.honeypotStatus}
        └─暂停交易：${tokenhydate.transferPausableV1}
        └─冷却交易：${tokenhydate.tradingCooldownV1}
        └─能否拉黑：${tokenhydate.isBlacklistedV1}
        └─限制卖出：${tokenhydate.cannotSellAllV1}
        └─能否增发：${tokenhydate.mintableV1}

[Dexscreener](https://dexscreener.com/ethereum/${pairAddress})|[Dextools](https://www.dextools.io/app/cn/ether/pair-explorer/${pairAddress})|[合约检查](https://tokensniffer.com/token/eth/${targetToken.address})|[部署地址](https://etherscan.io/address/${deployerAddress})

⏰*北京时间*：${currentTime} ⏰➡️@UniHoundChat`;
                console.log(message);
                const sqlInsert = `INSERT INTO messages (content) VALUES (?)`; // 使用问号(?)作为占位符

                // 使用MySQL的escape函数处理message变量中的特殊字符
                const escapedMessage = mysql.escape(message);

                // 执行SQL语句
                promisePool.query(sqlInsert, [escapedMessage])
                    .then(([rows, fields]) => {
                        // 执行成功后在控制台输出消息
                        console.log("已成功插入数据!");
                        bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
                    })
                    .catch(err => {
                        // 如果执行时发生错误，打印错误信息
                        console.error("Error inserting data: ", err);
                    });
            }
        }
        isProcessing = false; // processEvent函数执行完毕，设置标志位为false
    } catch (error) {
        // 把catch放在try的外面
        console.error(`Error in processEvent: ${error}`);
        isProcessing = false; // 如果出现错误，设置标志位为false
    }
}
