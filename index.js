require('colors')
const Big = require('big.js')
const gdax = require('./gdax')
const Sparkswap = require('./sparkswap')
const sparkswap = new Sparkswap(process.env.npm_package_config_sparkswap_config_path)
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
  console.log(`[${market}:${side}] Price: ${price}`.gray)

  console.log(`[${market}:${side}] Getting maximum order size`.gray)
  const maxOrderSize = await sparkswap.maxOrderSize(market, side, price)

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

  console.log(`[${market}:${side}] Placing order: `.gray + `${orderSize} @ ${price}`.cyan)
  const id = await sparkswap.place(market, side, price, orderSize)
  console.log(`[${market}:${side}] Placed order: `.gray + `${id}`.green)

  const order = sparkswap.watchOrderFillAmounts(id)

  order.on('error', (err) => {
    console.error(`[${market}:${side}] Error while watching ${id}: ${err}`)
    order.removeAllListeners()
  })

  order.on('done', (status) => {
    console.log(`[${market}:${side}] Order `.gray + `${id}`.green + ` ended on status: ${status}`)
    order.removeAllListeners()
  })

  order.on('fill', ({ amount, price }) => {
    // TODO: do the other side of the order on GDAX once it gets partially filled
    console.log(`[${market}:${side}] Order `.gray + `${id}`.green + ` filled with `.gray + `${amount} @ ${price}`.cyan)
  })
}

console.log('Starting 🤖 sparkbot, the '.green + '⚡ Sparkswap'.white + ' Trading Bot'.green)
console.log(`Watching markets: ${markets.join(', ')}`.gray)

setInterval(() => {
  markets.forEach(async (market) => {
    console.log(`[${market}]     Checking for new prices`.gray)

    const suggestions = await gdax.getSuggestedPrice(market, margin)

    console.log(`[${market}]     Got suggested prices`.gray)
    console.log(`[${market}]     Cancelling existing orders`.gray)

    await sparkswap.cancelAll(market)

    console.log(`[${market}]     Cancelled existing orders`.gray)

    sides.forEach((side) => {
      setNewOrder(market, side, suggestions[side.toLowerCase()])
    })
  })
}, interval)