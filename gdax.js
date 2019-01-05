const Big = require('big.js')
const Gdax = require('gdax')
const publicClient = new Gdax.PublicClient()

const PRODUCT_MAP = Object.freeze({
  'BTC/LTC': {
    gdaxProductId: 'LTC-BTC',
    exponent: -1
  }
})

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
    amount: Big(bestBid[1]).pow(exponent).toFixed(8)
  }
  const convertedAsk = {
    price: Big(bestAsk[0]).pow(exponent).toFixed(8),
    amount: Big(bestAsk[1]).pow(exponent).toFixed(8)
  }

  return {
    bid: convertedBid,
    ask: convertedAsk
  }
}

async function getSuggestedPrice(market, margin = 0.05) {
  const { bid: marketBid, ask: marketAsk } = await getMarketPrice(market)

  const suggestedBidPrice = Big(marketBid.price).times(Big(1).minus(margin))
  const suggestedAskPrice = Big(marketAsk.price).times(Big(1).plus(margin))

  return {
    bid: {
      price: suggestedBidPrice.toFixed(8),
      amount: marketBid.amount
    },
    ask: {
      price: suggestedAskPrice.toFixed(8),
      amount: marketAsk.amount
    }
  }
}

module.exports = {
  getMarketPrice,
  getSuggestedPrice
}
