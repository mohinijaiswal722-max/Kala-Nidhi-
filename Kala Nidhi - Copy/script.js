// Initialize Supabase Client
const SUPABASE_URL = 'https://gxsoehuxurrztnutzbik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4c29laHV4dXJyenRudXR6YmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMDA5MzIsImV4cCI6MjEwNDc3NjkzMn0.IlpPJqBzka-wXT7c7SS3FzqVm80eUgu3tZ9dRlS0m_Q';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

// Initialize App State safely based on available DOM elements
document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    
    // Only attempt to fetch if containers exist on the active page
    if (document.getElementById('artisansGrid')) {
        await fetchArtisans();
    }
    if (document.getElementById('productGrid')) {
        await fetchProducts();
    }
});

// Check Active Authentication Session
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserProfile(currentUser.id);
    } else {
        updateUI(null, null);
    }
}

// Fetch Profile Details
async function loadUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!error && data) {
        currentProfile = data;
        updateUI(currentUser, currentProfile);
    }
}

// Update UI based on User Role (Guarded with optional chaining / checks)
function updateUI(user, profile) {
    const authNavButtons = document.getElementById('authNavButtons');
    const userProfileNav = document.getElementById('userProfileNav');
    const navUserBadge = document.getElementById('navUserBadge');
    const artisanDashboard = document.getElementById('artisanDashboard');

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
    } else {
        if (authNavButtons) authNavButtons.classList.remove('hidden');
        if (userProfileNav) userProfileNav.classList.add('hidden');
        if (artisanDashboard) artisanDashboard.classList.add('hidden');
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

function switchAuthTab(tabName) {
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
}

// Authentication Handlers
async function handleLogin(event) {
    event.preventDefault();
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert(`Login failed: ${error.message}`);
    } else {
        currentUser = data.user;
        await loadUserProfile(currentUser.id);
        
        // Handle redirection if logging in from login.html or close modal if on index.html
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'index.html';
        } else {
            closeAuthModal();
            alert('Successfully logged in!');
        }
    }
}

async function handleArtisanRegister(event) {
    event.preventDefault();
    const name = document.getElementById('artisanName')?.value;
    const email = document.getElementById('artisanEmail')?.value;
    const password = document.getElementById('artisanPassword')?.value;
    const specialty = document.getElementById('artisanSpecialty')?.value;
    const location = document.getElementById('artisanLocation')?.value;

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        alert(`Registration failed: ${error.message}`);
        return;
    }

    if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            full_name: name,
            role: 'artisan',
            specialty,
            location
        }]);

        if (profileError) {
            alert(`Profile creation error: ${profileError.message}`);
        } else {
            alert('Artisan account created successfully!');
            if (window.location.pathname.includes('signup.html')) {
                window.location.href = 'login.html';
            } else {
                switchAuthTab('login');
            }
        }
    }
}

async function handleBuyerRegister(event) {
    event.preventDefault();
    const name = document.getElementById('buyerName')?.value;
    const email = document.getElementById('buyerEmail')?.value;
    const password = document.getElementById('buyerPassword')?.value;
    const location = document.getElementById('buyerLocation')?.value;

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        alert(`Registration failed: ${error.message}`);
        return;
    }

    if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            full_name: name,
            role: 'buyer',
            location
        }]);

        if (profileError) {
            alert(`Profile error: ${profileError.message}`);
        } else {
            alert('Buyer account created successfully!');
            if (window.location.pathname.includes('signup.html')) {
                window.location.href = 'login.html';
            } else {
                switchAuthTab('login');
            }
        }
    }
}

async function logoutUser() {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    updateUI(null, null);
    alert('Logged out successfully.');
}

// Product Management
async function handlePublishProduct(event) {
    event.preventDefault();
    if (!currentProfile || currentProfile.role !== 'artisan') {
        alert('Only registered artisans can publish products.');
        return;
    }

    const title = document.getElementById('productTitle').value;
    const category = document.getElementById('productCategory').value;
    const price = document.getElementById('productPrice').value;
    const image_url = document.getElementById('productPhoto').value;
    const description = document.getElementById('productDescription').value;

    const { error } = await supabase.from('products').insert([{
        title,
        category,
        price,
        image_url,
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

    const { data: products, error } = await supabase
        .from('products')
        .select(`*, profiles(full_name, location)`);

    if (error) return;

    grid.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.image_url}" alt="${product.title}" class="product-img">
            <div class="product-details">
                <span class="category-tag">${product.category}</span>
                <h3>${product.title}</h3>
                <p class="artisan-byline">By ${product.profiles?.full_name || 'Artisan'}</p>
                <p class="price">₹${product.price}</p>
                <p class="description">${product.description || ''}</p>
            </div>
        </div>
    `).join('');
}

async function fetchArtisans() {
    const grid = document.getElementById('artisansGrid');
    if (!grid) return;

    const { data: artisans, error } = await supabase
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