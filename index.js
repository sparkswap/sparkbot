require('colors')
const Big = require('big.js')
const gdax = require('./gdax')
const sparkswap = require('./sparkswap')
const markets = process.env.npm_package_config_markets.split(' ')
const placeMargin = 0 + process.env.npm_package_config_place_margin
const fillMargin = 0 + process.env.npm_package_config_place_margin
const globalMaxOrderSize = process.env.npm_package_config_max_order_size
const globalMinOrderSize = process.env.npm_package_config_min_order_size
const interval = (0 + process.env.npm_package_config_interval) * 1000
const sides = [
  'BID',
  'ASK'
]

function inverseSide(side) {
  if (sides.indexOf(side) === -1) {
    throw new Error(`Invalid side: ${side}`)
  }

  return sides[1 - sides.indexOf(side)]
}

function log(market, side, msg) {
  if (msg == null) {
    msg = side
    side = null
  }

  console.log(`[${market}${side ? ':' + side : ''}]${side ? ' ' : '     '}`.gray + msg)
}

function applyMargin(prices, margin = 0.05) {
  const { bid, ask } = prices

  const suggestedBidPrice = Big(bid.price).times(Big(1).minus(margin))
  const suggestedAskPrice = Big(ask.price).times(Big(1).plus(margin))

  return {
    bid: {
      price: suggestedBidPrice.toFixed(8),
      amount: bid.amount
    },
    ask: {
      price: suggestedAskPrice.toFixed(8),
      amount: ask.amount
    }
  }
}

async function setNewOrder(market, side, suggestion) {
  const { price, amount } = suggestion
  log(market, side, `Price: ${price}`.gray)

  log(market, side, `Getting maximum order size`.gray)
  const maxOrderSize = await sparkswap.maxOrderSize(market, side, price)

  let orderSize

  if (Big(maxOrderSize).gt(globalMaxOrderSize) && Big(amount).gt(globalMaxOrderSize)) {
    log(market, side, `Using global maximum order size (${globalMaxOrderSize})`.gray)
    orderSize = globalMaxOrderSize
  } else if (Big(amount).gt(maxOrderSize)) {
    log(market, side, `Using channel maximum order size (${maxOrderSize})`.gray)
    orderSize = maxOrderSize
  } else {
    log(market, side, `Using market maximum order size (${amount})`.gray)
    orderSize = amount
  }

  if (Big(orderSize).lte(globalMinOrderSize)) {
    log(market, side, `Order size (${orderSize}) is too small to place. Skipping.`.yellow)
    return
  }

  log(market, side, `Placing order: `.gray + `${orderSize} @ ${price}`.cyan)
  const id = await sparkswap.place(market, side, price, orderSize)
  log(market, side, `Placed order: `.gray + `${id}`.green)

  /**<TEST>**/
  /**</TEST>**/

  const order = sparkswap.watchOrderFillAmounts(id)

  order.on('error', (err) => {
   log(market, side, `Error while watching ${id}: ${err}`.red)
    order.removeAllListeners()
  })

  order.on('done', (status) => {
    log(market, side, `Order `.gray + `${id}`.green + ` ended on status: ${status}`.gray)
    order.removeAllListeners()
  })

  order.on('fill', async ({ amount, price }) => {
    log(market, side, `Order `.gray + `${id}`.green + ` filled with `.gray + `${amount} @ ${price}`.cyan)
    log(market, side, `Placing arb order: `.gray `${orderSize} @ market`.cyan)

    const marketPrices = applyMargin((await gdax.getMarketPrice(market)), fillMargin)
    // take the best price on the other side of the order book,
    const arbPrice = marketPrices[side.toLowerCase()].price
    const arbSide = inverseSide(side)
    log(market, side, `Got suggested ${arbSide} arb price: `.gray + `${arbPrice}`.cyan)
    const gdaxOrder = await gdax.place(market, arbSide, arbPrice, orderSize)
    log(market, side, `Completed arb ${arbSide} order `.gray + `${order.amount} @ ${gdaxOrder.price}`.cyan)


    // TODO: fix this calculation
    // const startValue = Big(price).times(amount)
    // const endValue = Big(order.price).times(amount)

    // let profit = {

    // }

    // if (side === 'BID') {
    //   Big(amount).minus(order.amount)
    //   Big(order.price).times(order.amount).minus(Big(amount).times(price))
    // }

    // if (side === 'BID') {
    //   profit = endValue.minus(startValue)
    // } else {
    //   profit = startValue.minus(startValue)
    // }

    // log(market, side, `Profit of `.gray + `${profit.toFixed(8)}`.cyan + ` on `.gray + `${id}`.green)
  })
}

console.log('Starting 🤖 sparkbot, the '.green + '⚡ Sparkswap'.white + ' Trading Bot'.green)
console.log(`Watching markets: ${markets.join(', ')}`.gray)

setInterval(() => {
  markets.forEach(async (market) => {
    log(market, `Checking for new prices`.gray)

    const suggestions = applyMargin((await gdax.getMarketPrice(market)), placeMargin)

    log(market, `Got suggested prices`.gray)
    log(market, `Cancelling existing orders`.gray)

    await sparkswap.cancelAll(market)

    log(market, `Cancelled existing orders`.gray)

    sides.forEach(async (side) => {
      try {
        await setNewOrder(market, side, suggestions[side.toLowerCase()])
      } catch(e) {
        log(market, side, `Error during order placement: ${e}`.red)
        console.error(e)
      }
    })
  })
}, interval)