const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/* -------------------------------------------------------
   PRICE HELPERS
------------------------------------------------------- */

function cleanPrice(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    let text = String(value).trim();

    text = text
        .replace(/₹/g, "")
        .replace(/Rs\.?/gi, "")
        .replace(/INR/gi, "")
        .replace(/USD/gi, "")
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .trim();

    const match = text.match(/\d+(?:\.\d+)?/);

    if (!match) {
        return null;
    }

    const number = Number(match[0]);

    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }

    return number;
}


function average(values) {
    if (!values.length) {
        return 0;
    }

    return values.reduce(
        (sum, value) => sum + value,
        0
    ) / values.length;
}


function median(values) {
    if (!values.length) {
        return 0;
    }

    const sorted = [...values].sort(
        (a, b) => a - b
    );

    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (
            (sorted[middle - 1] + sorted[middle]) / 2
        );
    }

    return sorted[middle];
}


/* -------------------------------------------------------
   GET USD → INR RATE
------------------------------------------------------- */

async function getUsdToInrRate() {
    const response = await fetch(
        "https://api.frankfurter.dev/v2/rate/usd/inr"
    );

    if (!response.ok) {
        throw new Error(
            `Unable to get USD/INR exchange rate (${response.status}).`
        );
    }

    const data = await response.json();

    const rate = Number(data?.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(
            "Invalid USD/INR exchange rate received."
        );
    }

    return rate;
}


/* -------------------------------------------------------
   NORMALIZE AMAZON PRICE
------------------------------------------------------- */

function convertToINR(price, currency, usdToInrRate) {
    const numericPrice = cleanPrice(price);

    if (!numericPrice) {
        return null;
    }

    const normalizedCurrency =
        String(currency || "USD")
            .trim()
            .toUpperCase();

    if (normalizedCurrency === "INR") {
        return numericPrice;
    }

    if (normalizedCurrency === "USD") {
        return numericPrice * usdToInrRate;
    }

    return null;
}


/* -------------------------------------------------------
   EDGE FUNCTION
------------------------------------------------------- */

Deno.serve(async (req) => {

    /* ---------------------------------------------------
       CORS
    --------------------------------------------------- */

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }


    /* ---------------------------------------------------
       ONLY POST
    --------------------------------------------------- */

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({
                success: false,
                error: "Only POST requests are allowed."
            }),
            {
                status: 405,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            }
        );
    }


    try {

        /* ------------------------------------------------
           READ REQUEST
        ------------------------------------------------ */

        const body = await req.json();

        const title = String(
            body.title || ""
        ).trim();

        const category = String(
            body.category || ""
        ).trim();

        const description = String(
            body.description || ""
        ).trim();

        const artisanPrice = cleanPrice(
            body.price
        );


        /* ------------------------------------------------
           VALIDATION
        ------------------------------------------------ */

        if (!title) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Product title is required."
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        if (!artisanPrice) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error:
                        "A valid product price is required."
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /* ------------------------------------------------
           BRIGHT DATA SECRET
        ------------------------------------------------ */

        const brightDataToken =
            Deno.env.get("BRIGHTDATA_API_TOKEN");

        if (!brightDataToken) {
            throw new Error(
                "BRIGHTDATA_API_TOKEN is not configured."
            );
        }


        /* ------------------------------------------------
           AMAZON KEYWORD
        ------------------------------------------------ */

        /*
         * We use the artisan's product title as the
         * Amazon search keyword.
         *
         * Example:
         *
         * "Hand Painted Terracotta Vase"
         */

        const keyword = title;


        console.log(
            "Amazon keyword:",
            keyword
        );


        /* ------------------------------------------------
           BRIGHT DATA AMAZON SCRAPER
        ------------------------------------------------ */

        const brightDataResponse = await fetch(
            "https://api.brightdata.com/datasets/v3/scrape" +
            "?dataset_id=gd_l7q7dkf244hwjntr0" +
            "&notify=false" +
            "&include_errors=true" +
            "&type=discover_new" +
            "&discover_by=keyword",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${brightDataToken}`,

                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    input: [
                        {
                            keyword: keyword,
                            zipcode: ""
                        }
                    ],

                    limit_per_input: null
                })
            }
        );


        /* ------------------------------------------------
           HANDLE BRIGHT DATA ERROR
        ------------------------------------------------ */

        if (!brightDataResponse.ok) {
    const errorText =
        await brightDataResponse.text();

    console.error(
        "Bright Data error:",
        errorText
    );

    return new Response(
        JSON.stringify({
            success: false,
            brightDataStatus: brightDataResponse.status,
            brightDataError: errorText
        }),
        {
            status: 400,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        }
    );
}


        /* ------------------------------------------------
           READ AMAZON RESPONSE
        ------------------------------------------------ */

        const responseText =
            await brightDataResponse.text();

        let data;

        try {
            data = JSON.parse(responseText);
        } catch (parseError) {

            console.error(
                "Bright Data returned non-JSON:",
                responseText.substring(0, 2000)
            );

            throw new Error(
                "Bright Data returned an unexpected response."
            );
        }


        console.log(
            "Bright Data response:",
            JSON.stringify(data).substring(0, 5000)
        );


        /* ------------------------------------------------
           NORMALIZE RESPONSE
        ------------------------------------------------ */

        let products = [];

        if (Array.isArray(data)) {
            products = data;
        } else if (Array.isArray(data?.data)) {
            products = data.data;
        } else if (Array.isArray(data?.results)) {
            products = data.results;
        }


        console.log(
            "Amazon products returned:",
            products.length
        );


        /* ------------------------------------------------
           GET CURRENT USD → INR RATE
        ------------------------------------------------ */

        const usdToInrRate =
            await getUsdToInrRate();

        console.log(
            "USD → INR rate:",
            usdToInrRate
        );


        /* ------------------------------------------------
           EXTRACT AMAZON PRICES
        ------------------------------------------------ */

        const prices = [];
        const sources = [];


        for (const item of products) {

            if (
                !item ||
                typeof item !== "object"
            ) {
                continue;
            }


            /*
             * Bright Data Amazon Products uses
             * initial_price and currency.
             *
             * We also support final_price and
             * a few fallback fields.
             */

            const rawPrice =
                item.final_price ??
                item.initial_price ??
                item.price ??
                item.product_price;


            const currency =
                item.currency ||
                "USD";


            const priceInINR =
                convertToINR(
                    rawPrice,
                    currency,
                    usdToInrRate
                );


            if (!priceInINR) {
                continue;
            }


            /*
             * Ignore obviously invalid prices.
             */

            if (
                priceInINR < 50 ||
                priceInINR > 1000000
            ) {
                continue;
            }


            prices.push(priceInINR);


            sources.push({
                title:
                    item.title ||
                    item.name ||
                    "",

                price:
                    Number(priceInINR.toFixed(2)),

                originalPrice:
                    cleanPrice(rawPrice),

                currency:
                    String(currency).toUpperCase(),

                seller:
                    item.seller_name ||
                    item.seller ||
                    "",

                brand:
                    item.brand ||
                    "",

                link:
                    item.url ||
                    item.product_url ||
                    ""
            });
        }


        /* ------------------------------------------------
           REMOVE EXTREME OUTLIERS
        ------------------------------------------------ */

        /*
         * We don't want one obviously unusual Amazon
         * listing to dominate the market calculation.
         *
         * For now, the main median remains based on all
         * valid prices. This section only logs the data.
         */

        console.log(
            "Usable INR prices:",
            prices
        );


        /* ------------------------------------------------
           NOT ENOUGH RESULTS
        ------------------------------------------------ */

        if (prices.length < 3) {

            return new Response(
                JSON.stringify({
                    success: false,

                    error:
                        "Not enough comparable Amazon prices were found for this product.",

                    pricesFound:
                        prices.length,

                    keyword
                }),
                {
                    status: 422,

                    headers: {
                        ...corsHeaders,
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /* ------------------------------------------------
           MARKET CALCULATIONS
        ------------------------------------------------ */

        const marketAveragePrice =
            average(prices);

        const marketMedianPrice =
            median(prices);


        /* ------------------------------------------------
           MAXIMUM ALLOWED PRICE
        ------------------------------------------------ */

        /*
         * Current KalaNidhi rule:
         *
         * Maximum allowed =
         * Market median + 50%
         *
         * Equivalent to:
         *
         * median × 1.5
         */

        const allowedMaxPrice =
            marketMedianPrice * 1.5;


        /* ------------------------------------------------
           PRICE DECISION
        ------------------------------------------------ */

        const priceAllowed =
            artisanPrice <= allowedMaxPrice;


        /* ------------------------------------------------
           FINAL RESULT
        ------------------------------------------------ */

        const result = {

            success: true,

            product: {
                title,
                category,
                description
            },

            artisanPrice:

                Number(
                    artisanPrice.toFixed(2)
                ),

            marketCurrency: "INR",

            exchangeRate: {
                from: "USD",
                to: "INR",
                rate:
                    Number(
                        usdToInrRate.toFixed(4)
                    )
            },

            marketAveragePrice:

                Number(
                    marketAveragePrice.toFixed(2)
                ),

            marketMedianPrice:

                Number(
                    marketMedianPrice.toFixed(2)
                ),

            allowedMaxPrice:

                Number(
                    allowedMaxPrice.toFixed(2)
                ),

            priceAllowed,

            pricesFound:
                prices.length,

            sources
        };


        console.log(
            "Price check result:",
            result
        );


        /* ------------------------------------------------
           RETURN RESULT
        ------------------------------------------------ */

        return new Response(
            JSON.stringify(result),

            {
                status: 200,

                headers: {
                    ...corsHeaders,

                    "Content-Type":
                        "application/json"
                }
            }
        );


    } catch (error) {

        console.error(
            "Price verification error:",
            error
        );


        return new Response(
            JSON.stringify({

                success: false,

                error:
                    error?.message ||
                    "Price verification failed."
            }),

            {
                status: 500,

                headers: {
                    ...corsHeaders,

                    "Content-Type":
                        "application/json"
                }
            }
        );
    }
});