const Big = require('big.js')
const expandTilde = require('./utils/expand-tilde')
const Gdax = require('gdax')
const config = require(expandTilde(process.env.npm_package_config_gdax_config_path))
const publicClient = new Gdax.PublicClient(config.uri)
const authedClient = new Gdax.AuthenticatedClient(
  config.key,
  config.secret,
  config.passphrase,
  config.uri
)
const PRODUCT_MAP = Object.freeze({
  'BTC/LTC': {
    gdaxProductId: 'LTC-BTC',
    exponent: -1,
    amountPrecision: 5,
    pricePrecision: 5
  }
})
const SIDES_MAP = Object.freeze({
  BID: 'buy',
  ASK: 'sell'
})

// this should only be used for orders that are expected to be executed immediately
async function place(market, side, price, amount) {
  if (!PRODUCT_MAP[market]) {
    throw new Error(`${market} is not supported. Only ${Object.keys(PRODUCT_MAP).join(', ')} are supported.`)
  }

  const productId = PRODUCT_MAP[market].gdaxProductId
  const exponent = PRODUCT_MAP[market].exponent
  const pricePrecision = PRODUCT_MAP[market].pricePrecision
  const amountPrecision = PRODUCT_MAP[market].amountPrecision
  const amountParam = PRODUCT_MAP[market].amountParam

  if (!SIDES_MAP[side]) {
    throw new Error(`Invalid side: ${side}`)
  }

  const gdaxSide = SIDES_MAP[side]

  const params = {
    type: 'limit',
    time_in_force: 'FOK',
    side: gdaxSide,
    product_id: productId,
    price: Big(price).pow(exponent).toFixed(pricePrecision),
    size: Big(amount).times(price).toFixed(amountPrecision)
  }

  const { id } = await authedClient.placeOrder(params)
  const order = await authedClient.getOrder(id)

  // Sanity check that it's done
  if (!order.settled || order.status !== 'done') {
    throw new Error(`Order ${id} is not done.`)
  }

  // this price removes the fees taken by GDAX
  const executedPrice = Big(order.executed_value).div(order.filled_size)

  return {
    id: order.id,
    // use our exponent to return the accurate price
    price: Big(executedPrice).pow(exponent).toFixed(8),
    amount: order.executed_value
  }
}

async function getMarketPrice(market) {
  if (!PRODUCT_MAP[market]) {
    throw new Error(`${market} is not supported. Only ${Object.keys(PRODUCT_MAP).join(', ')} are supported.`)
  }

  const productId = PRODUCT_MAP[market].gdaxProductId
  const exponent = PRODUCT_MAP[market].exponent

  const { bids, asks } = await publicClient.getProductOrderBook(productId, { level: 1 })

  const bestBid = bids[0]
  const bestAsk = asks[0]

  const convertedBid = {
    price: Big(bestBid[0]).pow(exponent).toFixed(8),
    // need the amount in BTC, not LTC
    amount: Big(bestBid[1]).div(bestBid[0]).toFixed(8)
  }
  const convertedAsk = {
    price: Big(bestAsk[0]).pow(exponent).toFixed(8),
    // need the amount in BTC, not LTC
    amount: Big(bestAsk[1]).div(bestBid[0]).toFixed(8)
  }

  return {
    bid: convertedBid,
    ask: convertedAsk
  }
}

module.exports = {
  place,
  getMarketPrice
}
