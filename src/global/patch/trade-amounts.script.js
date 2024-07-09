var signalSources = ["GALAXY", "CRYPTO_HUNTER"]

db.getCollection("units").find({}).toArray().forEach(unit => {

    print(`[START] trade amount data correction for unit ${unit.identifier}`)

    unit.tradeAmounts = new Map()

    signalSources.forEach(singalSource => {

        unit.tradeAmounts.set(singalSource, unit.usdtPerTransaction)

    })

    delete unit.usdtPerTransaction

    db.getCollection("units").replaceOne(
        { identifier: unit.identifier },
        unit
    )

    print(`[STOP] trade amount data correction for unit ${unit.identifier}`)

})
