// ==========================================
// 1. SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://gxsoehuxurrztnutzbik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4c29laHV4dXJyenRudXR6YmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMDA5MzIsImV4cCI6MjEwNDc3NjkzMn0.IlpPJqBzka-wXT7c7SS3FzqVm80eUgu3tZ9dRlS0m_Q';

// Init a separate client only for this stale auth helper script.
// The main site uses the client declared in script.js.
const supabaseAuthClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. TAB SWITCHING LOGIC
// ==========================================
function switchAuthTab(tabType) {
    const artisanForm = document.getElementById('artisanRegisterForm');
    const buyerForm = document.getElementById('buyerRegisterForm');
    const artisanTab = document.getElementById('tabRegArtisan');
    const buyerTab = document.getElementById('tabRegBuyer');

    if (tabType === 'regArtisan') {
        artisanForm.classList.remove('hidden');
        buyerForm.classList.add('hidden');
        
        artisanTab.classList.add('active');
        artisanTab.setAttribute('aria-selected', 'true');
        buyerTab.classList.remove('active');
        buyerTab.setAttribute('aria-selected', 'false');
    } else {
        buyerForm.classList.remove('hidden');
        artisanForm.classList.add('hidden');
        
        buyerTab.classList.add('active');
        buyerTab.setAttribute('aria-selected', 'true');
        artisanTab.classList.remove('active');
        artisanTab.setAttribute('aria-selected', 'false');
    }
}

// ==========================================
// 3. ARTISAN REGISTRATION HANDLER
// ==========================================
async function handleArtisanRegister(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    const fullName = document.getElementById('artisanName').value;
    const email = document.getElementById('artisanEmail').value;
    const password = document.getElementById('artisanPassword').value;
    const specialty = document.getElementById('artisanSpecialty').value;
    const location = document.getElementById('artisanLocation').value;

    try {
        // Step A: Register User in Supabase Auth
        const { data: authData, error: authError } = await supabaseAuthClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'artisan'
                }
            }
        });

        if (authError) throw authError;

        // Step B: Save artisan profile data to public.profiles table
        if (authData.user) {
            const { error: profileError } = await supabaseAuthClient
                .from('profiles')
                .insert([
                    {
                        id: authData.user.id,
                        full_name: fullName,
                        role: 'artisan',
                        craft_specialty: specialty,
                        location: location
                    }
                ]);

            if (profileError) throw profileError;

            alert('Registration successful! Check your email for verification.');
            window.location.href = 'login.html';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Artisan Account';
    }
}

// ==========================================
// 4. BUYER REGISTRATION HANDLER
// ==========================================
async function handleBuyerRegister(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    const fullName = document.getElementById('buyerName').value;
    const email = document.getElementById('buyerEmail').value;
    const password = document.getElementById('buyerPassword').value;
    const location = document.getElementById('buyerLocation').value;

    try {
        // Step A: Register User in Supabase Auth
        const { data: authData, error: authError } = await supabaseAuthClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'buyer'
                }
            }
        });

        if (authError) throw authError;

        // Step B: Save buyer profile data to public.profiles table
        if (authData.user) {
            const { error: profileError } = await supabaseAuthClient
                .from('profiles')
                .insert([
                    {
                        id: authData.user.id,
                        full_name: fullName,
                        role: 'buyer',
                        location: location
                    }
                ]);

            if (profileError) throw profileError;

            alert('Registration successful! Check your email for verification.');
            window.location.href = 'login.html';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Buyer Account';
    }
}