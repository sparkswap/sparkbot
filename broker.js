const basicAuth = require('./basic-auth')
const grpc = require('grpc')
const Big = require('big.js')
const { promisify } = require('util')
const path = require('path')
const os = require('os')
const { readFileSync } = require('fs')
const PROTO_OPTIONS = {
  convertFieldsToCamelCase: true,
  binaryAsBase64: true,
  longsAsStrings: true,
  enumsAsStrings: true
}

const brokerProto = grpc.load(path.resolve(__dirname, path.join('proto', 'broker.proto')), 'proto', PROTO_OPTIONS)

const DEFAULT_RPC_PORT = '27492'

function expandTilde(str) {
  // https://github.com/nodejs/node/issues/684 is still unresolved so we perform
  // our own tilde expansion to get the full file path
  let pathParts = str.split(path.sep)
  if (pathParts[0] === '~') {
    pathParts[0] = os.homedir()
  }
  return path.join(...pathParts)
}

class BrokerClient {
  constructor(configPath = '~/.sparkswap/config.js') {
    const config = require(expandTilde(configPath))

    this.address = config.rpcAddress || 'localhost:27492'
    this.disableAuth = config.disableAuth || false
    this.certPath = config.rpcCertPath || '~/.sparkswap/certs/broker-rpc-tls.cert'
    this.username = config.rpcUser || 'sparkswap'
    this.password = config.rpcPass || 'sparkswap'

    const [host, port] = this.address.split(':')

    // Set a default port if the port is not specified
    if (!port) {
      this.address = `${host}:${DEFAULT_RPC_PORT}`
    }

    if (this.disableAuth) {
      this.credentials = grpc.credentials.createInsecure()
    } else {
      if (!this.username) throw new Error('No username is specified for authentication')
      if (!this.password) throw new Error('No password is specified for authentication')

      this.cert = readFileSync(expandTilde(this.certPath))

      const channelCredentials = grpc.credentials.createSsl(this.cert)
      const callCredentials = basicAuth.generateBasicAuthCredentials(this.username, this.password)

      this.credentials = grpc.credentials.combineChannelCredentials(channelCredentials, callCredentials)
    }

    this.orderService = new brokerProto.broker.rpc.OrderService(this.address, this.credentials)
    this.walletService = new brokerProto.broker.rpc.WalletService(this.address, this.credentials)
  }

  async cancelAll(market) {
    const deadline = new Date().setSeconds(new Date().getSeconds() + 5)
    const { blockOrders } = await promisify(this.orderService.getBlockOrders.bind(this.orderService))({ market }, { deadline })

    const activeBlockOrders = blockOrders.filter(blockOrder => blockOrder.status === 'ACTIVE')

    return Promise.all(activeBlockOrders.map((blockOrder) => promisify(this.orderService.cancelBlockOrder.bind(this.orderService))({ blockOrderId: blockOrder.blockOrderId }, { deadline })))
  }

  async place(market, side, price, amount) {
    const deadline = new Date().setSeconds(new Date().getSeconds() + 5)

    const { blockOrderId } = await promisify(this.orderService.createBlockOrder.bind(this.orderService))({
      market,
      side,
      amount,
      limitPrice: price,
      timeInForce: 'GTC'
    })

    return blockOrderId
  }

  // Get the maximum size of the order based on your available trading capacity
  // Returns in base units
  async maxOrderSize(market, side, price) {
    const deadline = new Date().setSeconds(new Date().getSeconds() + 5)

    if (!['BID', 'ASK'].includes(side)) {
      throw new Error(`Invalid side: ${side}`)
    }

    const {
      baseSymbolCapacities,
      counterSymbolCapacities
    } = await promisify(this.walletService.getTradingCapacities.bind(this.walletService))(
      { market },
      { deadline }
    )

    let receiveCapacity
    let sendCapacity

    // bid buys (receives) base
    if (side === 'BID') {
      receiveCapacity = Big(baseSymbolCapacities.availableReceiveCapacity)
      sendCapacity = Big(counterSymbolCapacities.availableSendCapacity).div(price)
    } else {
      receiveCapacity = Big(counterSymbolCapacities.availableReceiveCapacity).div(price)
      sendCapacity = Big(baseSymbolCapacities.availableSendCapacity)
    }

    // leave room for routing fees
    sendCapacity = sendCapacity.times(1 - 0.01)

    if (sendCapacity.gt(receiveCapacity)) {
      return sendCapacity.toString()
    }

    return receiveCapacity.toString()
  }

  async watchOrder(id, interval = 5000) {
    const deadline = new Date().setSeconds(new Date().getSeconds() + 5)

    const order = await promisify(this.orderService.getBlockOrder.bind(this.orderService))({ blockOrderId: id }, { deadline })

    if (order.status === 'FAILED') {
      return 'FAILED'
    }

    if (order.status === 'COMPLETE') {
      return 'COMPLETE'
    }

    if (order.status === 'CANCELLED') {
      return 'CANCELLED'
    }

    console.log(`Order ${id} is still active.`)
  }
}

module.exports = BrokerClient