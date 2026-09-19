// Initialize Supabase Client
const SUPABASE_URL = 'https://gxsoehuxurrztnutzbik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4c29laHV4dXJyenRudXR6YmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMDA5MzIsImV4cCI6MjEwNDc3NjkzMn0.IlpPJqBzka-wXT7c7SS3FzqVm80eUgu3tZ9dRlS0m_Q';
    window.googleTranslateElementInit = function() {
        if (typeof window.google?.translate?.TranslateElement !== 'function' || !document.getElementById('google_translate_element')) return;
        new window.google.translate.TranslateElement({
            pageLanguage: 'en',
            autoDisplay: false
        }, 'google_translate_element');
    };

    function toggleLanguageMenu() {
        const menu = document.getElementById('languageMenu');
        const button = document.getElementById('languageMenuButton');
        const isOpen = menu?.classList.toggle('is-open');
        button?.setAttribute('aria-expanded', String(Boolean(isOpen)));
    }

    function changeLanguage(languageCode) {
        const translator = document.querySelector('.goog-te-combo');
        if (languageCode === 'hi') {
            window.location.href = 'indexhindi.html';
            return;
        }
        if (languageCode === 'en') {
            window.location.href = 'index.html';
            return;
        }
        if (!translator || !translator.options.length) {
            translatePageWithMyMemory(languageCode);
            return;
        }
        const languageOption = Array.from(translator.options).find(option => option.value === languageCode);
        if (!languageOption) {
            showToast('This language is not available in the translator.', 'error');
            return;
        }
        translator.value = languageOption.value;
        translator.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('languageMenu')?.classList.remove('is-open');
        document.getElementById('languageMenuButton')?.setAttribute('aria-expanded', 'false');
    }

    const translationSources = new WeakMap();

    async function translatePageWithMyMemory(targetLanguage) {
        const button = document.getElementById('languageMenuButton');
        if (button) button.disabled = true;
        showToast('Translating the page...');

        try {
            const sourceLanguage = document.documentElement.lang === 'hi' ? 'hi' : 'en';
            const textNodes = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const parent = node.parentElement;
                    if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return node.textContent.trim().length > 1
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            });

            while (walker.nextNode()) textNodes.push(walker.currentNode);

            const uniqueTexts = [...new Set(textNodes.map(node => translationSources.get(node) || node.textContent.trim()))];
            const translations = new Map();
            await Promise.all(uniqueTexts.map(async text => {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage}|${targetLanguage}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('Translation service request failed.');
                const result = await response.json();
                const translated = result.responseData?.translatedText;
                if (translated) translations.set(text, translated);
            }));

            textNodes.forEach(node => {
                const original = translationSources.get(node) || node.textContent.trim();
                translationSources.set(node, original);
                if (translations.has(original)) node.textContent = translations.get(original);
            });

            document.querySelectorAll('input[placeholder], textarea[placeholder], [aria-label]').forEach(element => {
                ['placeholder', 'aria-label'].forEach(attribute => {
                    const value = element.getAttribute(attribute);
                    if (value && translations.has(value)) element.setAttribute(attribute, translations.get(value));
                });
            });
            showToast('Translation complete.');
        } catch (error) {
            console.error('Translation failed:', error);
            showToast('Translation service is unavailable. Check your internet connection.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    window.toggleLanguageMenu = toggleLanguageMenu;
    window.changeLanguage = changeLanguage;
    

let currentUser = null;
let currentProfile = null;
let supabaseClient = null;
let productsCache = [];

function ensureSupabaseClient() {
    if (!supabaseClient && window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// Initialize App State safely based on available DOM elements
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('productPhoto') || document.getElementById('artisanImageFile')) {
        createCameraDialog();
    }
    if (ensureSupabaseClient()) {
        await checkSession();
    } else {
        updateUI(null, null);
    }

    if (document.getElementById('artisansGrid')) {
        await fetchArtisans();
    }
    if (document.getElementById('productGrid')) {
        await fetchProducts();
    }
});

let activeCameraInputId = null;
let cameraStream = null;

function createCameraDialog() {
    if (document.getElementById('cameraDialog')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="camera-dialog hidden" id="cameraDialog" role="dialog" aria-modal="true" aria-label="Take a photo">
            <div class="camera-dialog-card">
                <button class="modal-close" type="button" onclick="closeCamera()" aria-label="Close camera">&times;</button>
                <h2>Take a photo</h2>
                <video id="cameraPreview" autoplay playsinline></video>
                <canvas id="cameraCanvas" class="hidden"></canvas>
                <div class="camera-actions">
                    <button class="btn-secondary" type="button" onclick="closeCamera()">Cancel</button>
                    <button class="btn-submit" type="button" onclick="captureCameraPhoto()"><i class="fa-solid fa-camera"></i> Capture</button>
                </div>
            </div>
        </div>
    `);
}

async function openCamera(inputId) {
    activeCameraInputId = inputId;
    createCameraDialog();
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('Camera access is not supported in this browser.');
        return;
    }
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const preview = document.getElementById('cameraPreview');
        preview.srcObject = cameraStream;
        document.getElementById('cameraDialog').classList.remove('hidden');
    } catch (error) {
        console.error('Camera access failed:', error);
        alert('Camera access was denied or is unavailable. Check browser permissions.');
    }
}

function closeCamera() {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    const preview = document.getElementById('cameraPreview');
    if (preview) preview.srcObject = null;
    document.getElementById('cameraDialog')?.classList.add('hidden');
}

function captureCameraPhoto() {
    const preview = document.getElementById('cameraPreview');
    const canvas = document.getElementById('cameraCanvas');
    const input = document.getElementById(activeCameraInputId);
    if (!preview || !canvas || !input || !preview.videoWidth) return;

    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext('2d').drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const transfer = new DataTransfer();
        if (input.multiple) Array.from(input.files).forEach(existingFile => transfer.items.add(existingFile));
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        showToast('Photo captured and added.');
        closeCamera();
    }, 'image/jpeg', 0.9);
}

window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.captureCameraPhoto = captureCameraPhoto;

// Check Active Authentication Session
async function checkSession() {
    const client = ensureSupabaseClient();
    if (!client) {
        updateUI(null, null);
        return;
    }

    const { data: { session } } = await client.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserProfile(currentUser.id);
    } else {
        updateUI(null, null);
    }
}

// Fetch Profile Details
async function loadUserProfile(userId) {
    const client = ensureSupabaseClient();
    if (!client) return;

    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!error && data) {
        currentProfile = data;
        updateUI(currentUser, currentProfile);
    } else {
        currentProfile = null;
        updateUI(currentUser, null);
    }
}



// Update UI based on User Role (Guarded with optional chaining / checks)
function updateUI(user, profile) {
    const authNavButtons = document.getElementById('authNavButtons');
    const userProfileNav = document.getElementById('userProfileNav');
    const navUserBadge = document.getElementById('navUserBadge');
    const artisanDashboard = document.getElementById('artisanDashboard');
    const buyerArea = document.getElementById('buyerArea');

    if (user && profile) {
        if (authNavButtons) authNavButtons.classList.add('hidden');
        if (userProfileNav) userProfileNav.classList.remove('hidden');
        if (navUserBadge) navUserBadge.textContent = `${profile.full_name} (${profile.role.toUpperCase()})`;

        if (artisanDashboard) {
            if (profile.role === 'artisan') {
                artisanDashboard.classList.remove('hidden');
            } else {
                artisanDashboard.classList.add('hidden');
            }
        }

        if (buyerArea) {
            buyerArea.classList.toggle('hidden', profile.role !== 'buyer');
        }

        if (profile.role === 'buyer') loadBuyerData();
    } else {
        if (authNavButtons) authNavButtons.classList.remove('hidden');
        if (userProfileNav) userProfileNav.classList.add('hidden');
        if (artisanDashboard) artisanDashboard.classList.add('hidden');
        if (buyerArea) buyerArea.classList.add('hidden');
    }
}

// Modal Handlers
function openAuthModal(tabName) {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.remove('hidden');
        switchAuthTab(tabName);
    }
}

function closeAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.add('hidden');
    }
}

window.switchAuthTab = function(tabName) {
    const tabs = ['tabLogin', 'tabRegArtisan', 'tabRegBuyer'];
    const forms = ['loginForm', 'artisanRegisterForm', 'buyerRegisterForm'];

    tabs.forEach(tab => document.getElementById(tab)?.classList.remove('active'));
    forms.forEach(form => document.getElementById(form)?.classList.add('hidden'));

    if (tabName === 'login') {
        document.getElementById('tabLogin')?.classList.add('active');
        document.getElementById('loginForm')?.classList.remove('hidden');
    } else if (tabName === 'regArtisan') {
        document.getElementById('tabRegArtisan')?.classList.add('active');
        document.getElementById('artisanRegisterForm')?.classList.remove('hidden');
    } else if (tabName === 'regBuyer') {
        document.getElementById('tabRegBuyer')?.classList.add('active');
        document.getElementById('buyerRegisterForm')?.classList.remove('hidden');
    }
};

// Authentication Handlers
window.handleLogin = async function(event) {
    event.preventDefault();
    const client = ensureSupabaseClient();
    const emailInput = document.getElementById('loginEmail') || document.getElementById('buyerLoginEmail');
    const passwordInput = document.getElementById('loginPassword') || document.getElementById('buyerLoginPassword');

    if (!client) {
        alert('Supabase is not ready. Please refresh the page and try again.');
        return;
    }

    if (!emailInput || !passwordInput) {
        alert('Login form fields were not found.');
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
        alert(`Login failed: ${error.message}`);
        return;
    }

    if (!data?.user) {
        alert('Login did not return a user session. Please try again.');
        return;
    }

    currentUser = data.user;
    await loadUserProfile(currentUser.id);

    if (!currentProfile) {
        await client.auth.signOut();
        alert('Login succeeded, but your profile could not be loaded.');
        return;
    }

    updateUI(currentUser, currentProfile);

    if (window.location.pathname.includes('login_hindi.html')) {
        window.location.replace('indexhindi.html');
    } else if (window.location.pathname.includes('login.html')) {
        window.location.replace('index.html');
    } else {
        closeAuthModal();
        alert('Successfully logged in!');
    }
};

window.handleArtisanRegister = async function(event) {
    event.preventDefault();
    const name = document.getElementById('artisanName')?.value;
    const email = document.getElementById('artisanEmail')?.value;
    const password = document.getElementById('artisanPassword')?.value;
    const specialty = document.getElementById('artisanSpecialty')?.value;
    const location = document.getElementById('artisanLocation')?.value;
    const story = document.getElementById('artisanStory')?.value;
    const imageFile = document.getElementById('artisanImageFile')?.files?.[0];

    if (!email || !password || !name || !imageFile || !story) {
        alert('Please complete the artisan form before submitting.');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
                role: 'artisan',
                specialty,
                location
            }
        }
    });

    if (error) {
        alert(`Registration failed: ${error.message}`);
        return;
    }

    if (data.user) {
        if (!data.session) {
            const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (loginError) {
                alert('Account created successfully. Please sign in manually from the login page.');
            } else {
                currentUser = loginData.user;
            }
        } else {
            currentUser = data.user;
        }

        if (currentUser) {
            const imageUrls = await uploadImages('profile-images', [imageFile], currentUser.id);
            if (!imageUrls.length) {
                alert('Account created, but the artisan image could not be uploaded.');
                return;
            }
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: currentUser.id,
                    full_name: name,
                    role: 'artisan',
                    craft_specialty: specialty,
                    location,
                    profile_image_url: imageUrls[0],
                    story
                }, { onConflict: 'id' });

            if (profileError) {
                console.error('Profile upsert error:', profileError);
            }
        }

        alert('Artisan account created successfully!');
        if (window.location.pathname.includes('signup_hindi.html')) {
            window.location.href = 'login_hindi.html';
        } else if (window.location.pathname.includes('signup.html')) {
            window.location.href = 'login.html';
        } else {
            switchAuthTab('login');
        }
    }
};

window.handleBuyerRegister = async function(event) {
    event.preventDefault();
    const name = document.getElementById('buyerName')?.value;
    const email = document.getElementById('buyerEmail')?.value;
    const password = document.getElementById('buyerPassword')?.value;
    const location = document.getElementById('buyerLocation')?.value;

    if (!email || !password || !name) {
        alert('Please complete the buyer form before submitting.');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
                role: 'buyer',
                location
            }
        }
    });

    if (error) {
        alert(`Registration failed: ${error.message}`);
        return;
    }

    if (data.user) {
        if (!data.session) {
            const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (loginError) {
                alert('Account created successfully. Please sign in manually from the login page.');
            } else {
                currentUser = loginData.user;
            }
        } else {
            currentUser = data.user;
        }

        if (currentUser) {
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: currentUser.id,
                    full_name: name,
                    role: 'buyer',
                    craft_specialty: null,
                    location,
                    profile_image_url: null,
                    story: null
                }, { onConflict: 'id' });

            if (profileError) {
                console.error('Profile upsert error:', profileError);
            }
        }

        alert('Buyer account created successfully!');
        if (window.location.pathname.includes('signup_hindi.html')) {
            window.location.href = 'login_hindi.html';
        } else if (window.location.pathname.includes('signup.html')) {
            window.location.href = 'login.html';
        } else {
            switchAuthTab('login');
        }
    }
};

async function logoutUser() {
    const client = ensureSupabaseClient();
    if (client) await client.auth.signOut();
    currentUser = null;
    currentProfile = null;
    updateUI(null, null);
    alert('Logged out successfully.');
}

// Product Management
async function uploadImages(bucket, files, folder) {
    const client = ensureSupabaseClient();
    if (!client || !files?.length) return [];
    const urls = [];

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not an image.`, 'error');
            continue;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast(`${file.name} is larger than 5 MB.`, 'error');
            continue;
        }
        const extension = file.name.split('.').pop() || 'jpg';
        const path = `${folder}/${crypto.randomUUID()}.${extension}`;
        const { error } = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
        if (error) {
            console.error(`${bucket} upload failed:`, error);
            showToast(`Image upload failed: ${error.message}`, 'error');
            continue;
        }
        urls.push(client.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    }
    return urls;
}

async function handlePublishProduct(event) {
    event.preventDefault();
    if (!currentProfile || currentProfile.role !== 'artisan') {
        alert('Only registered artisans can publish products.');
        return;
    }

    const title = document.getElementById('productTitle').value;
    const category = document.getElementById('productCategory').value;
    const price = document.getElementById('productPrice').value;
    const imageFiles = Array.from(document.getElementById('productPhoto')?.files || []).slice(0, 6);
    const description = document.getElementById('productDescription').value;

    if (!imageFiles.length) {
        alert('Please select or capture at least one product image.');
        return;
    }

    const imageUrls = await uploadImages('product-images', imageFiles, currentProfile.id);
    if (!imageUrls.length) {
        alert('Product publishing stopped because no image could be uploaded.');
        return;
    }

    const { error } = await supabaseClient.from('products').insert([{
        title,
        category,
        price,
        image_url: imageUrls[0],
        image_urls: imageUrls,
        description,
        artisan_id: currentProfile.id
    }]);

    if (error) {
        alert(`Publishing failed: ${error.message}`);
    } else {
        alert('Product published successfully!');
        document.getElementById('productForm').reset();
        await fetchProducts();
    }
}

// Fetch and Render Data
async function fetchProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const { data: products, error } = await supabaseClient
        .from('products')
        .select(`*, profiles(full_name, location)`);

    if (error) {
        grid.innerHTML = '<p class="empty-state">Products could not be loaded.</p>';
        return;
    }

    productsCache = products || [];
    grid.innerHTML = productsCache.map(product => `
        <article class="product-card">
            <button class="product-card-button" type="button" onclick="openProductDetails(${product.id})">
                <img src="${escapeHtml(getProductImage(product))}" alt="${escapeHtml(product.title)}" class="product-img">
            </button>
            <div class="product-info">
                <span class="product-category">${escapeHtml(product.category)}</span>
                <h3 class="product-title">${escapeHtml(product.title)}</h3>
                <p class="artisan-details">By ${escapeHtml(product.profiles?.full_name || 'Artisan')}</p>
                <p class="product-price">₹${Number(product.price).toLocaleString('en-IN')}</p>
                <button class="btn-buy-now" type="button" onclick="openProductDetails(${product.id})">View product</button>
            </div>
        </article>
    `).join('');
}

function filterProducts() {
    const grid = document.getElementById('productGrid');
    const search = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const category = document.getElementById('categoryFilter')?.value || 'All';
    if (!grid) return;

    const filteredProducts = productsCache.filter(product => {
        const searchableText = [product.title, product.category, product.description, product.profiles?.full_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return searchableText.includes(search) && (category === 'All' || product.category === category);
    });

    grid.innerHTML = filteredProducts.length
        ? filteredProducts.map(product => `
            <article class="product-card">
                <button class="product-card-button" type="button" onclick="openProductDetails(${product.id})">
                    <img src="${escapeHtml(getProductImage(product))}" alt="${escapeHtml(product.title)}" class="product-img">
                </button>
                <div class="product-info">
                    <span class="product-category">${escapeHtml(product.category)}</span>
                    <h3 class="product-title">${escapeHtml(product.title)}</h3>
                    <p class="artisan-details">By ${escapeHtml(product.profiles?.full_name || 'Artisan')}</p>
                    <p class="product-price">₹${Number(product.price).toLocaleString('en-IN')}</p>
                    <button class="btn-buy-now" type="button" onclick="openProductDetails(${product.id})">View product</button>
                </div>
            </article>
        `).join('')
        : '<p class="empty-state">No products match your search.</p>';
}

function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const input = document.getElementById('searchInput');
    const button = document.getElementById('searchVoiceButton');
    if (!SpeechRecognition || !input) {
        showToast('Voice search is not supported in this browser.', 'error');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button?.classList.add('is-listening');
    showToast('Listening for a product name...');

    recognition.onresult = event => {
        input.value = event.results[0][0].transcript;
        filterProducts();
        showToast(`Searching for “${input.value}”`);
    };
    recognition.onerror = event => showToast(`Voice search failed: ${event.error}`, 'error');
    recognition.onend = () => button?.classList.remove('is-listening');
    recognition.start();
}

window.filterProducts = filterProducts;
window.startVoiceSearch = startVoiceSearch;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getProductImage(product) {
    if (Array.isArray(product.image_urls) && product.image_urls.length) return product.image_urls[0];
    return product.image_url || 'assets/logo.png.jpeg';
}

function getProductImages(product) {
    if (Array.isArray(product.image_urls) && product.image_urls.length) return product.image_urls;
    return product.image_url ? [product.image_url] : ['assets/logo.png.jpeg'];
}

async function openProductDetails(productId) {
    const product = productsCache.find(item => Number(item.id) === Number(productId));
    const modal = document.getElementById('productDetailModal');
    const content = document.getElementById('productDetailContent');
    if (!product || !modal || !content) return;

    const client = ensureSupabaseClient();
    const { data: reviews } = await client
        .from('product_reviews')
        .select('*, profiles(full_name)')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false });

    const reviewRows = reviews || [];
    let isWishlisted = false;
    if (currentUser && currentProfile?.role === 'buyer') {
        const { data: wishlistRow } = await client
            .from('wishlists')
            .select('id')
            .eq('buyer_id', currentUser.id)
            .eq('product_id', product.id)
            .maybeSingle();
        isWishlisted = Boolean(wishlistRow);
    }
    const average = reviewRows.length
        ? (reviewRows.reduce((sum, review) => sum + review.rating, 0) / reviewRows.length).toFixed(1)
        : 'No ratings';
    const reviewHtml = reviewRows.length
        ? reviewRows.map(review => `
            <div class="review-item">
                <strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
                <span>${escapeHtml(review.profiles?.full_name || 'Buyer')}</span>
                <p>${escapeHtml(review.review)}</p>
            </div>
        `).join('')
        : '<p class="empty-state">No reviews yet. Be the first to review this product.</p>';

    content.innerHTML = `
        <div class="product-gallery">
            ${getProductImages(product).map(image => `<img class="detail-image" src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">`).join('')}
        </div>
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h2 id="productDetailTitle">${escapeHtml(product.title)}</h2>
        <p class="artisan-details">By ${escapeHtml(product.profiles?.full_name || 'Artisan')}</p>
        <p class="product-price">₹${Number(product.price).toLocaleString('en-IN')} <span class="rating-summary">${average} (${reviewRows.length})</span></p>
        <p class="description">${escapeHtml(product.description || 'No description provided.')}</p>
        <div class="product-actions">
            <button id="wishlistButton-${product.id}" class="btn-secondary action-button${isWishlisted ? ' is-active' : ''}" type="button" onclick="toggleWishlist(${product.id}, event)"><i class="fa-solid fa-heart"></i> ${isWishlisted ? 'Wishlisted' : 'Wishlist'}</button>
            <button id="cartButton-${product.id}" class="btn-secondary action-button" type="button" onclick="addToCart(${product.id}, event)"><i class="fa-solid fa-cart-shopping"></i> Add to cart</button>
            <button id="orderButton-${product.id}" class="btn-buy-now action-button" type="button" onclick="orderProduct(${product.id}, 1, event)"><i class="fa-solid fa-bag-shopping"></i> Order now</button>
        </div>
        <section class="product-reviews">
            <h3>Ratings and reviews <span class="rating-summary">${average}</span></h3>
            <div>${reviewHtml}</div>
        </section>
        <form class="review-form" onsubmit="submitReview(event, ${product.id})">
            <h3>Leave a review</h3>
            <select name="rating" required aria-label="Rating">
                <option value="">Choose rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Very good</option>
                <option value="3">3 - Good</option>
                <option value="2">2 - Fair</option>
                <option value="1">1 - Poor</option>
            </select>
            <textarea name="review" rows="3" placeholder="Share your experience" required></textarea>
            <button class="btn-submit" type="submit">Submit review</button>
        </form>
    `;
    modal.classList.remove('hidden');
}

function closeProductDetails() {
    document.getElementById('productDetailModal')?.classList.add('hidden');
}

function requireBuyer() {
    if (!currentUser || !currentProfile || currentProfile.role !== 'buyer') {
        alert('Please log in with a buyer account to use shopping features.');
        return false;
    }
    return true;
}

function showToast(message, type = 'success') {
    let toast = document.getElementById('actionToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'actionToast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `action-toast ${type}`;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setActionButton(button, text, active = false) {
    if (!button) return;
    button.classList.add('action-complete');
    button.classList.toggle('is-active', active);
    const icon = button.querySelector('i');
    button.innerHTML = `${icon ? icon.outerHTML : ''} ${text}`;
    setTimeout(() => button.classList.remove('action-complete'), 550);
}

async function toggleWishlist(productId, event) {
    if (!requireBuyer()) return;
    const client = ensureSupabaseClient();
    const { data: existing, error: lookupError } = await client
        .from('wishlists')
        .select('id')
        .eq('buyer_id', currentUser.id)
        .eq('product_id', productId)
        .maybeSingle();
    if (lookupError) {
        console.error('Wishlist lookup failed:', lookupError);
        showToast(`Wishlist unavailable: ${lookupError.message}`, 'error');
        return;
    }
    const result = existing
        ? await client.from('wishlists').delete().eq('id', existing.id)
        : await client.from('wishlists').insert({ buyer_id: currentUser.id, product_id: productId });
    if (result.error) {
        console.error('Wishlist update failed:', result.error);
        showToast(`Wishlist failed: ${result.error.message}`, 'error');
        return;
    }
    const button = event?.currentTarget || document.getElementById(`wishlistButton-${productId}`);
    setActionButton(button, existing ? 'Wishlist' : 'Wishlisted', !existing);
    showToast(existing ? 'Removed from wishlist.' : 'Saved to wishlist.');
    await loadBuyerData();
}

async function addToCart(productId, event) {
    if (!requireBuyer()) return;
    const client = ensureSupabaseClient();
    const { data: existing, error: lookupError } = await client
        .from('cart_items')
        .select('id, quantity')
        .eq('buyer_id', currentUser.id)
        .eq('product_id', productId)
        .maybeSingle();
    if (lookupError) {
        console.error('Cart lookup failed:', lookupError);
        showToast(`Cart unavailable: ${lookupError.message}`, 'error');
        return;
    }
    const result = existing
        ? await client.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
        : await client.from('cart_items').insert({ buyer_id: currentUser.id, product_id: productId, quantity: 1 });
    if (result.error) {
        console.error('Cart update failed:', result.error);
        showToast(`Cart failed: ${result.error.message}`, 'error');
        return;
    }
    setActionButton(event?.currentTarget || document.getElementById(`cartButton-${productId}`), existing ? `Cart: ${existing.quantity + 1}` : 'Added to cart');
    showToast(existing ? `Cart quantity: ${existing.quantity + 1}` : 'Product added to cart.');
    await loadBuyerData();
}

async function orderProduct(productId, quantity = 1, event) {
    if (!requireBuyer()) return;
    const product = productsCache.find(item => Number(item.id) === Number(productId));
    if (!product) return;
    const client = ensureSupabaseClient();
    const { error } = await client.from('orders').insert({
        buyer_id: currentUser.id,
        product_id: product.id,
        quantity,
        total_price: Number(product.price) * quantity
    });
    if (error) {
        console.error('Order failed:', error);
        showToast(`Order failed: ${error.message}`, 'error');
    }
    else {
        setActionButton(event?.currentTarget || document.getElementById(`orderButton-${productId}`), 'Order placed');
        showToast('Order placed successfully.');
        closeProductDetails();
        await loadBuyerData();
    }
}

async function submitReview(event, productId) {
    event.preventDefault();
    if (!requireBuyer()) return;
    const form = event.currentTarget;
    const client = ensureSupabaseClient();
    const { error } = await client.from('product_reviews').upsert({
        buyer_id: currentUser.id,
        product_id: productId,
        rating: Number(form.rating.value),
        review: form.review.value.trim()
    }, { onConflict: 'buyer_id,product_id' });
    if (error) alert(`Review failed: ${error.message}`);
    else {
        alert('Review saved.');
        await openProductDetails(productId);
    }
}

async function loadBuyerData() {
    if (!currentUser || currentProfile?.role !== 'buyer') return;
    const client = ensureSupabaseClient();
    const [wishlistResult, cartResult, orderResult] = await Promise.all([
        client.from('wishlists').select('id, products(id, title, price)').eq('buyer_id', currentUser.id),
        client.from('cart_items').select('id, quantity, products(id, title, price)').eq('buyer_id', currentUser.id),
        client.from('orders').select('id, quantity, total_price, status, products(title)').eq('buyer_id', currentUser.id).order('created_at', { ascending: false })
    ]);
    [wishlistResult, cartResult, orderResult].forEach(result => {
        if (result.error) console.error('Buyer data load failed:', result.error);
    });
    renderBuyerList('wishlistItems', wishlistResult.data, item => `${item.products?.title || 'Product'} <small>₹${item.products?.price || 0}</small>`);
    renderBuyerList('cartItems', cartResult.data, item => `${item.products?.title || 'Product'} <small>Qty: ${item.quantity}</small><button class="btn-buy-now" type="button" onclick="orderProduct(${item.products?.id}, ${item.quantity})">Order</button>`);
    renderBuyerList('orderItems', orderResult.data, item => `${item.products?.title || 'Product'} <small>${item.status} · ₹${item.total_price}</small>`);
}

function renderBuyerList(elementId, items, renderItem) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = items?.length
        ? items.map(item => `<div class="buyer-item">${renderItem(item)}</div>`).join('')
        : '<p class="empty-state">Nothing here yet.</p>';
}

window.openProductDetails = openProductDetails;
window.closeProductDetails = closeProductDetails;
window.toggleWishlist = toggleWishlist;
window.addToCart = addToCart;
window.orderProduct = orderProduct;
window.submitReview = submitReview;

async function fetchArtisans() {
    const grid = document.getElementById('artisansGrid');
    if (!grid) return;

    const { data: artisans, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('role', 'artisan');

    if (error) return;

    grid.innerHTML = artisans.map(artisan => `
        <div class="artisan-card">
            <h3>${artisan.full_name}</h3>
            <p><strong>Specialty:</strong> ${artisan.specialty || 'Traditional Craft'}</p>
            <p><strong>Region:</strong> ${artisan.location || 'India'}</p>
        </div>
    `).join('');
}

// AI Description Generator (Mock)
function generateAIDescription() {
    const title = document.getElementById('productTitle')?.value;
    const category = document.getElementById('productCategory')?.value;
    if (!title) {
        alert('Please enter a product title first.');
        return;
    }
    const descField = document.getElementById('productDescription');
    if (descField) {
        descField.value = `Handcrafted ${title} made using traditional ${category} techniques. Authentically created by skilled Indian artisans.`;
    }
}

// Voice Dictation Function
function simulateVoiceInput(elementId) {
    const target = document.getElementById(elementId);
    if (!target) return;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.start();

        recognition.onresult = (event) => {
            target.value = event.results[0][0].transcript;
        };
    } else {
        alert('Web Speech API is not supported in this browser.');
    }
}

window.updateUI = updateUI;
window.checkSession = checkSession;
window.loadUserProfile = loadUserProfile;