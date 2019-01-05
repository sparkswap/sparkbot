require('colors')
const Big = require('big.js')
const gdax = require('./gdax')
const BrokerClient = require('./broker')
const broker = new BrokerClient(process.env.npm_package_config_config_path)
const markets = process.env.npm_package_config_markets.split(' ')
const margin = 0 + process.env.npm_package_config_margin
const globalMaxOrderSize = process.env.npm_package_config_max_order_size
const interval = (0 + process.env.npm_package_config_interval) * 1000
const sides = [
  'BID',
  'ASK'
]

async function setNewOrder(market, side, suggestion) {
  const { price, amount } = suggestion

  console.log(`[${market}:${side}] Getting maximum order size`.gray)
  const maxOrderSize = await broker.maxOrderSize(market, side, price)

  let orderSize

  if (Big(maxOrderSize).gt(globalMaxOrderSize) && Big(amount).gt(globalMaxOrderSize)) {
    console.log(`[${market}:${side}] Using global maximum order size (${globalMaxOrderSize})`.gray)
    orderSize = globalMaxOrderSize
  } else if (Big(amount).gt(maxOrderSize)) {
    console.log(`[${market}:${side}] Using channel maximum order size (${maxOrderSize})`.gray)
    orderSize = maxOrderSize
  } else {
    console.log(`[${market}:${side}] Using market maximum order size (${amount})`.gray)
    orderSize = amount
  }

  if (Big(orderSize).lte(0)) {
    console.log(`[${market}:${side}] Order size (${orderSize}) is too small to place. Skipping.`.yellow)
    return
  }

  console.log(`[${market}:${side}] Placing order`.gray)
  const id = await broker.place(market, side, price, orderSize)
  console.log(`[${market}:${side}] Placed order: `.gray + `${id}`.green)

  try {
    const status = await broker.watchOrder(id)
    console.log(`[${market}:${side}] Order `.gray + `${id}`.green + ` ended on status: ${status}`)
  } catch (e) {
    console.error(`[${market}:${side}] Error while watching ${id}: ${e}`)
  }
}

console.log('Starting 🤖 sparkbot, the '.green + '⚡ Sparkswap'.white + ' Trading Bot'.green)
console.log(`Watching markets: ${markets.join(', ')}`.gray)

setInterval(() => {
  markets.forEach(async (market) => {
    console.log(`[${market}]     Checking for new prices`.gray)

    const suggestions = await gdax.getSuggestedPrice(market, margin)

    console.log(`[${market}]     Got suggested prices`.gray)
    console.log(`[${market}]     Cancelling existing orders`.gray)

    await broker.cancelAll(market)

    console.log(`[${market}]     Cancelled existing orders`.gray)

    sides.forEach((side) => {
      setNewOrder(market, side, suggestions[side.toLowerCase()])
    })
  })
}, interval)