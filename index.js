const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function median(values) {
    if (!values.length) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

function average(values) {
    if (!values.length) return 0;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cleanPrice(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value !== "string") {
        return 0;
    }

    const cleaned = value
        .replace(/₹/g, "")
        .replace(/INR/gi, "")
        .replace(/,/g, "")
        .replace(/[^\d.]/g, "");

    const number = Number(cleaned);

    return Number.isFinite(number) ? number : 0;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }

    try {
        const body = await req.json();

        const title = String(body.title || "").trim();
        const category = String(body.category || "").trim();
        const description = String(body.description || "").trim();
        const submittedPrice = Number(body.price);

        if (!title || !category) {
            return new Response(
                JSON.stringify({
                    error: "Product title and category are required."
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

        if (!Number.isFinite(submittedPrice) || submittedPrice <= 0) {
            return new Response(
                JSON.stringify({
                    error: "Product price must be greater than zero."
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

        const serpApiKey = Deno.env.get("SERPAPI_KEY");

        if (!serpApiKey) {
            throw new Error(
                "SERPAPI_KEY is not configured."
            );
        }

        const query =
            `${title} ${category} handmade India price`;

        const searchUrl =
            "https://serpapi.com/search.json" +
            "?engine=google_shopping" +
            `&q=${encodeURIComponent(query)}` +
            "&location=India" +
            "&hl=en" +
            "&gl=in" +
            `&api_key=${encodeURIComponent(serpApiKey)}`;

        const response = await fetch(searchUrl);

        if (!response.ok) {
            throw new Error(
                `Online price search failed: ${response.status}`
            );
        }

        const searchData = await response.json();

        const shoppingResults =
            Array.isArray(searchData.shopping_results)
                ? searchData.shopping_results
                : [];

        const comparableProducts = shoppingResults
            .map(item => {
                const price = cleanPrice(item.price);

                if (!price) return null;

                return {
                    title: item.title || "",
                    price,
                    source: item.source || "",
                    link: item.link || ""
                };
            })
            .filter(Boolean)
            .slice(0, 20);

        if (comparableProducts.length < 3) {
            return new Response(
                JSON.stringify({
                    verified: false,
                    allowed: false,
                    message:
                        "Not enough comparable products were found online.",
                    comparable_count:
                        comparableProducts.length
                }),
                {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const prices = comparableProducts.map(
            item => item.price
        );

        const marketAverage = average(prices);
        const marketMedian = median(prices);

        // Allow up to 50% above the market median.
        const allowedMax = Math.round(
            marketMedian * 1.5
        );

        const allowed =
            submittedPrice <= allowedMax;

        return new Response(
            JSON.stringify({
                verified: true,
                allowed,

                submitted_price: submittedPrice,

                market_average_price:
                    Math.round(marketAverage),

                market_median_price:
                    Math.round(marketMedian),

                allowed_max_price:
                    allowedMax,

                comparable_count:
                    comparableProducts.length,

                sources: comparableProducts
            }),
            {
                status: 200,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
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
                error:
                    error?.message ||
                    "Price verification failed."
            }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            }
        );
    }
});