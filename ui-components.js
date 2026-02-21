// ui-components.js - PART 2 of 3 (Visual Renderer)
// RESPONSIBILITY: Generating HTML structures & Updating DOM
// DEPENDENCIES: None (Pure UI Functions)

const DEFAULT_IMAGE = 'https://i.ibb.co/HTNrbJxD/20250716-222246.png';
const WHATSAPP_NUMBER = '7903698180';
const BANK_LOGO_URL = 'https://ik.imagekit.io/kdtvm0r78/IMG-20251202-WA0000.jpg';

// --- 1. Header Buttons Renderer ---
export function displayHeaderButtons(buttons, container, staticContainer) {
    if (!container || !staticContainer) return;
    
    container.innerHTML = '';
    staticContainer.innerHTML = '';
    
    if (!buttons || Object.keys(buttons).length === 0) {
        container.innerHTML = '<p class="loading-text" style="color: white;">No actions configured.</p>';
        return;
    }

    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'dynamic-buttons-wrapper';

    // Sorting buttons by order
    Object.values(buttons).sort((a, b) => (a.order || 99) - (b.order || 99)).forEach(btnData => {
        const isAutoUrl = btnData.url === 'auto';
        const isLink = btnData.url && !isAutoUrl;
        
        const element = document.createElement(isLink ? 'a' : 'button');
        element.className = `${btnData.base_class || 'civil-button'} ${btnData.style_preset || ''}`;
        
        if (btnData.id) element.id = btnData.id;

        if (isLink) {
            element.href = btnData.url;
            if (btnData.target) element.target = btnData.target;
        }

        // HTML Content for Button
        element.innerHTML = `${btnData.icon_svg || ''}<b>${btnData.name || ''}</b>` + 
                           (btnData.id === 'notificationBtn' ? '<span id="notificationDot" class="notification-dot"></span>' : '');
        
        // Custom Styling (Color/Border) if not using preset classes
        if (!['viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
            Object.assign(element.style, {
                backgroundColor: btnData.transparent ? 'transparent' : (btnData.color || 'var(--primary-color)'),
                color: btnData.textColor || 'white',
                borderColor: btnData.borderColor,
                borderWidth: btnData.borderWidth,
                borderStyle: (parseFloat(btnData.borderWidth) > 0 || btnData.style_preset === 'btn-outline') ? 'solid' : 'none'
            });
        }

        // Distribute to appropriate container
        if (['viewBalanceBtn', 'viewPenaltyWalletBtn'].includes(btnData.id)) {
            staticContainer.appendChild(element);
        } else {
            buttonWrapper.appendChild(element);
        }
    });
    
    container.appendChild(buttonWrapper);
}

// --- 2. Member Cards Renderer ---
export function displayMembers(members, adminSettings, container, onProfileClick) {
    if (!container) return;
    container.innerHTML = '';
    
    if (!members || members.length === 0) {
        container.innerHTML = '<p class="loading-text">Koi sadasya nahi mila.</p>';
        return;
    }

    const normalCardFrameUrl = adminSettings.normal_card_frame_url || 'https://ik.imagekit.io/nsyr92pse/20251007_103318.png';
    const rankFrames = {
        gold: 'https://ik.imagekit.io/kdtvm0r78/1764742107098.png',
        silver: 'https://ik.imagekit.io/kdtvm0r78/20251203_134510.png',
        bronze: 'https://ik.imagekit.io/kdtvm0r78/20251203_133726.png'
    };

    members.forEach((member, index) => {
        const card = document.createElement('div');
        
        if (index < 3) {
            // Top 3 Ranking Cards
            const rankType = ['gold', 'silver', 'bronze'][index];
            card.className = `framed-card-wrapper ${rankType}-card animate-on-scroll`;
            
            card.innerHTML = `
                <div class="framed-card-content">
                    <img src="${member.displayImageUrl}" alt="${member.name}" class="framed-member-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                    <img src="${rankFrames[rankType]}" alt="${rankType} frame" class="card-frame-image">
                    <div class="framed-info-container">
                        <p class="framed-member-name ${rankType}-text">${member.name}</p>
                        <div class="framed-balance-badge ${rankType}-bg">
                            ${formatCurrency(member.balance)}
                        </div>
                    </div>
                    ${member.isPrime ? '<div class="framed-prime-tag">Prime</div>' : ''}
                </div>`;
        } else {
            // Normal Cards
            card.className = 'normal-framed-card-wrapper animate-on-scroll';
            const rankText = getRankText(index + 1);
            
            card.innerHTML = `
                <div class="normal-card-content">
                    <img src="${member.displayImageUrl}" alt="${member.name}" class="normal-framed-photo" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                    <img src="${normalCardFrameUrl}" alt="Card Frame" class="normal-card-frame-image">
                    <div class="normal-card-rank">${rankText}</div>
                    <div class="normal-info-container">
                        <p class="normal-framed-name">${member.name}</p>
                        <div class="normal-framed-balance">${formatCurrency(member.balance)}</div>
                    </div>
                    ${member.isPrime ? '<div class="normal-prime-tag">Prime</div>' : ''}
                </div>`;
        }
        
        card.onclick = () => onProfileClick(member.id);
        container.appendChild(card);
    });
}

// --- 3. Products Renderer ---
export function renderProducts(products, container, onEmiClick) {
    if (!container) return;
    const entries = Object.entries(products);
    
    if (entries.length === 0) {
        const section = container.closest('.products-section');
        if (section) section.style.display = 'none';
        return;
    }
    
    container.innerHTML = '';
    entries.forEach(([id, product]) => {
        const card = document.createElement('div');
        card.className = 'product-card animate-on-scroll';
        
        const price = parseFloat(product.price) || 0;
        const mrp = parseFloat(product.mrp) || 0;
        const hasEmi = product.emi && Object.keys(product.emi).length > 0;

        const whatsappLink = generateWhatsAppLink(product, price, hasEmi);

        card.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${product.imageUrl}" alt="${product.name}" class="product-image" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
            </div>
            <div class="product-info">
                <p class="product-name">${product.name}</p>
                <div class="product-price-container">
                    <span class="product-price">${formatCurrency(price)}</span>
                    ${mrp > price ? `<span class="product-mrp">${formatCurrency(mrp)}</span>` : ''}
                </div>
                ${hasEmi ? `<a class="product-emi-link" data-id="${id}">View EMI Details</a>` : ''}
            </div>
            <div class="product-actions">
                <a href="${whatsappLink}" target="_blank" class="product-btn whatsapp">
                    <img src="https://www.svgrepo.com/show/452133/whatsapp.svg" alt="WhatsApp">
                </a>
                <a href="${product.exploreLink || '#'}" target="_blank" class="product-btn explore">Explore</a>
            </div>`;

        if (hasEmi) {
            const link = card.querySelector('.product-emi-link');
            link.addEventListener('click', () => onEmiClick(product.emi, product.name, price));
        }
        container.appendChild(card);
    });
}

// --- 4. Custom Cards & Community Letters ---
export function displayCustomCards(cards, container) {
    const section = document.getElementById('customCardsSection');
    const indicator = document.getElementById('custom-cards-indicator');
    if (!container || !section) return;
    
    container.innerHTML = '';
    const cardArray = Object.values(cards);
    
    if (cardArray.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    cardArray.forEach(cardData => {
        const card = document.createElement('div');
        card.className = 'custom-card animate-on-scroll';
        card.innerHTML = `
            <div class="custom-card-img-wrapper">
                <img src="${cardData.imageUrl || DEFAULT_IMAGE}" class="custom-card-img" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                <a href="${cardData.buttonLink || '#'}" class="custom-card-btn" style="background-color: ${cardData.buttonColor || 'var(--primary-color)'}" target="_blank">${cardData.buttonText || 'Learn More'}</a>
            </div>
            <div class="custom-card-content">
                <h3 class="custom-card-title">${cardData.title || ''}</h3>
                <p class="custom-card-desc">${cardData.description || ''}</p>
            </div>`;
        container.appendChild(card);
    });
    
    // Slider Dot Logic
    if (indicator && cardArray.length > 1) {
        indicator.style.display = 'block';
        indicator.innerHTML = '';
        cardArray.forEach((card, idx) => {
            const dot = document.createElement('span');
            dot.className = 'indicator-dot';
            dot.style.backgroundImage = `url(${card.imageUrl})`;
            dot.onclick = () => container.children[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            indicator.appendChild(dot);
        });
        
        // Scroll Listener for Active Dot
        const onScroll = () => {
             const scrollLeft = container.scrollLeft;
             const width = container.children[0].offsetWidth;
             const activeIdx = Math.round(scrollLeft / width);
             Array.from(indicator.children).forEach((dot, i) => dot.classList.toggle('active', i === activeIdx));
        };
        // Remove old listener to prevent duplicates if re-rendering
        if (container._scrollHandler) container.removeEventListener('scroll', container._scrollHandler);
        container._scrollHandler = onScroll;
        container.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

export function displayCommunityLetters(letters, container, onImageClick) {
    if (!container) return;
    container.innerHTML = '';
    const letterArray = Object.values(letters);
    
    if (letterArray.length === 0) {
        container.innerHTML = `<div class="slide"><p class="p-8 text-center text-gray-500">No letters available.</p></div>`;
    } else {
        letterArray.forEach(letter => {
            const slide = document.createElement('div');
            slide.className = 'slide';
            const img = document.createElement('img');
            img.src = letter.imageUrl;
            img.loading = 'lazy';
            img.onerror = function() { this.src = DEFAULT_IMAGE; };
            img.onclick = () => onImageClick(letter.imageUrl, 'Community Letter');
            slide.appendChild(img);
            container.appendChild(slide);
        });
    }

    // Slider Controls (Prev/Next)
    let currentIndex = 0;
    const slides = container.children;
    const total = slides.length;
    const indicator = document.getElementById('slideIndicator');
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');

    if (indicator) {
        indicator.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('span');
            dot.className = 'indicator-dot';
            dot.onclick = () => updateSlide(i);
            indicator.appendChild(dot);
        }
    }

    const updateSlide = (index) => {
        currentIndex = (index + total) % total;
        container.style.transform = `translateX(${-currentIndex * 100}%)`;
        if (indicator && indicator.children.length > 0) {
            Array.from(indicator.children).forEach((dot, idx) => dot.classList.toggle('active', idx === currentIndex));
        }
    };

    if (prevBtn) prevBtn.onclick = () => updateSlide(currentIndex - 1);
    if (nextBtn) nextBtn.onclick = () => updateSlide(currentIndex + 1);
    // Initial Slide
    if (total > 0) updateSlide(0);
}

// --- 5. Info & Headers ---
export function updateInfoCards(count, loan) {
    const countEl = document.getElementById('totalMembersValue');
    const loanEl = document.getElementById('totalLoanValue');
    if (countEl) countEl.textContent = count;
    if (loanEl) loanEl.textContent = formatCurrency(loan);
}

export function startHeaderDisplayRotator(container, members, stats) {
    if (!container) return;
    const adContent = container.querySelector('.ad-content');
    if (!adContent) return;

    const ads = [];
    const topThree = members.slice(0, 3);
    
    if (topThree.length >= 3) {
        ads.push(() => {
            const html = topThree.map(m => `
                <div class="ad-top-three-member">
                    <img src="${m.displayImageUrl}" class="ad-top-three-img">
                    <p class="ad-top-three-name">${m.name}</p>
                    <p class="ad-top-three-amount">${formatCurrency(m.balance)}</p>
                </div>`).join('');
            return `<div class="ad-headline">🚀 Top 3 Wealth Creators 🚀</div><div class="ad-top-three-container">${html}</div>`;
        });
    }
    
    if (stats) {
        ads.push(() => `
            <div class="ad-bank-stats-container">
                <img src="${BANK_LOGO_URL}" class="ad-bank-logo">
                <ul class="ad-bank-stats">
                    <li>Established: <strong>23 June 2024</strong></li>
                    <li>Members: <strong>${members.length}</strong></li>
                    <li>Loan Disbursed: <strong>${formatCurrency(stats.totalLoanDisbursed)}</strong></li>
                </ul>
            </div>`);
    }

    if (ads.length === 0) return;
    let index = 0;
    
    const show = () => {
        adContent.innerHTML = ads[index]();
        index = (index + 1) % ads.length;
    };
    show();
    // Clear previous interval if exists to avoid collision
    if (container._rotatorInterval) clearInterval(container._rotatorInterval);
    container._rotatorInterval = setInterval(show, 6000);
}

export function buildInfoSlider(container, members) {
    if (!container) return;
    container.innerHTML = '';
    
    const cards = [
        { icon: 'dollar-sign', title: 'Fund Deposit', text: 'Sabhi sadasya milkar fund jama karte hain <strong>(Every Month SIP)</strong> ke roop mein.', img: 'https://i.ibb.co/LzBMSjTy/20251005-091714.png' },
        { icon: 'gift', title: 'Loan Provision', text: 'Zarooratmand sadasya ko usi fund se <strong>loan</strong> diya jaata hai.', img: 'https://i.ibb.co/WNkzG5rm/20251005-100155.png' },
        { icon: 'calendar', title: 'Loan Duration', text: 'Loan keval <strong>1 mahine</strong> ke liye hota hai (nyunatam byaj par).', img: 'https://i.ibb.co/bjkNcWrv/20251005-100324.png' },
        { icon: 'percent', title: 'Interest Rate', text: 'Avadhi aur rashi ke anusaar byaj darein badal sakti hain.', img: 'https://i.ibb.co/3ypdpzWR/20251005-095800.png' }
    ];

    members.filter(m => m.isPrime).forEach(pm => {
        cards.push({
            icon: 'award',
            title: 'Prime Member',
            html: `<div class="prime-member-card"><img src="${pm.displayImageUrl}" onerror="this.src='${DEFAULT_IMAGE}'"><span>${pm.name}</span></div>`
        });
    });

    cards.forEach(c => {
        container.innerHTML += `
            <div class="info-card-slide animate-on-scroll">
                <h3><i data-feather="${c.icon}"></i> ${c.title}</h3>
                ${c.text ? `<p>${c.text}</p>` : c.html}
                ${c.img ? `<img src="${c.img}" class="info-card-image" onerror="this.style.display='none'">` : ''}
            </div>`;
    });
}

// --- Helper Utilities (Formatting) ---
function formatCurrency(amount) {
    return (amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function getRankText(i) {
    const j = i % 10, k = i % 100;
    if (j == 1 && k != 11) return i + "st";
    if (j == 2 && k != 12) return i + "nd";
    if (j == 3 && k != 13) return i + "rd";
    return i + "th";
}

function generateWhatsAppLink(product, price, hasEmi) {
    let text = `Hello, I want to know more about *${product.name}*.\n\n*Price:* ${formatCurrency(price)}\n*Product Link:* ${product.exploreLink || 'N/A'}`;
    if (hasEmi) {
        text += `\n\n*EMI Available*`;
    }
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
