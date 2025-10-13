document.addEventListener("DOMContentLoaded", () => {
    
    // Function to fetch Firebase config and initialize the app
    async function checkAuthAndInitialize() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Configuration failed to load.');
            const config = await response.json();
            
            firebase.initializeApp(config.firebase);
            
            // Check user authentication status
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    runAppLogic(); // If logged in, run the main app logic
                } else {
                    // If not logged in, redirect to login page
                    window.location.href = `/login.html?redirect=${window.location.pathname}`;
                }
            });

        } catch (error)
        {
            console.error("Initialization Error:", error);
            const loader = document.getElementById('loader');
            loader.innerHTML = `<p style="color: red;">Application failed to initialize: ${error.message}</p>`;
        }
    }

    // Main function that contains all the dashboard logic
    function runAppLogic() {
        // Blinking animation ke liye CSS code joda gaya hai
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes blink {
                0% { opacity: 1; }
                50% { opacity: 0.4; }
                100% { opacity: 1; }
            }
            .blinking-banner {
                animation: blink 1.5s infinite;
            }
        `;
        document.head.appendChild(style);

        // SVG Icons used in the UI
        const ICONS = {
            calendar: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>`,
            money: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V8.25c0-.621.504-1.125 1.125-1.125h1.5" /></svg>`,
            tag: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>`,
            download: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`,
            clock: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
            product: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 0 1 3.375-3.375h1.5a1.125 1.125 0 0 1 1.125 1.125v-1.5a3.375 3.375 0 0 1 3.375-3.375h9.75" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`,
            processing: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>`,
            interest: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V6h-1.755M19.5 10.5v.15a6 6 0 1 1-11.378-2.143" /></svg>`,
            emi: `<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18M12 14.25h.008v.008H12v-.008Z" /></svg>`,
        };

        const state = {
            allActiveLoans: [],
            membersData: {},
            ui: {
                loader: document.getElementById('loader'),
                container: document.getElementById('outstanding-loans-container'),
                totalCountEl: document.getElementById('total-outstanding-count'),
                totalAmountEl: document.getElementById('total-outstanding-amount'),
                searchInput: document.getElementById('search-input'),
                modal: document.getElementById('credit-modal'),
                modalTitle: document.getElementById('modal-title'),
                openModalBtn: document.getElementById('generate-credit-btn'),
                closeModalBtn: document.querySelector('.close-modal-btn'),
                memberSelect: document.getElementById('member-select'),
                cardTypeSelect: document.getElementById('card-type-select'),
                amountFields: document.getElementById('amount-fields'),
                rechargeFields: document.getElementById('recharge-fields'),
                creditAmountInput: document.getElementById('credit-amount'),
                telecomSelect: document.getElementById('telecom-select'),
                generateCardBtn: document.getElementById('generate-card-btn'),
                generatedCardContainer: document.getElementById('generated-card-container'),
                modalStatus: document.getElementById('modal-status'),
            },
        };

        async function fetchAndProcessData() {
            state.ui.loader.innerHTML = '<div class="spinner"></div>Loading active loans...';
            state.ui.loader.classList.remove('hidden');
            state.ui.container.innerHTML = '';
            try {
                const db = firebase.database();
                const activeLoansRef = db.ref('activeLoans');
                const membersRef = db.ref('members');

                const [loansSnapshot, membersSnapshot] = await Promise.all([
                    activeLoansRef.once('value'),
                    membersRef.once('value')
                ]);

                if (!loansSnapshot.exists() || !membersSnapshot.exists()) {
                    throw new Error('No active loans or member data found.');
                }
                
                state.membersData = membersSnapshot.val();
                const activeLoansData = loansSnapshot.val();

                state.allActiveLoans = Object.values(activeLoansData)
                    .filter(loan => loan.status === 'Active')
                    .map(loan => {
                        const memberInfo = state.membersData[loan.memberId] || {};
                        return { ...loan, memberName: memberInfo.fullName || 'Unknown', profilePicUrl: memberInfo.profilePicUrl || null };
                    })
                    .sort((a, b) => new Date(a.loanDate) - new Date(b.loanDate));
                
                populateMembersDropdown(); 
                displayAllData();

            } catch (error) {
                console.error("Data fetch failed:", error);
                state.ui.container.innerHTML = `<p style="color: red; text-align: center;">Data could not be loaded: ${error.message}</p>`;
            } finally {
                state.ui.loader.classList.add('hidden');
            }
        }
        
        function displayAllData() {
            displaySummary(state.allActiveLoans);
            displayLoanCards(state.allActiveLoans);
        }

        function displaySummary(loans) {
            const { totalCountEl, totalAmountEl } = state.ui;
            const totalAmount = loans.reduce((sum, loan) => sum + parseFloat(loan.outstandingAmount), 0);
            totalCountEl.textContent = loans.length;
            totalAmountEl.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
        }
        
        function displayLoanCards(loans) {
            const { container } = state.ui;
            container.innerHTML = '';
            if (loans.length === 0) {
                container.innerHTML = `<div class="message-box"><h2>All Clear!</h2><p>There are no outstanding loans.</p></div>`;
                return;
            }
            loans.forEach(loan => {
                const card = document.createElement('div');
                const cardId = `loan-card-${loan.loanId}`;
                card.id = cardId;
                const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loan.memberName)}&background=4f46e5&color=fff&size=50`;
                const profilePic = loan.profilePicUrl || defaultPic;
                const loanDate = new Date(loan.loanDate);
                const daysAgo = Math.floor((new Date() - loanDate) / (1000 * 3600 * 24));
                const today = new Date();

                if (['10 Days Credit', 'Recharge', 'Grocery Credit'].includes(loan.loanType)) {
                    card.className = 'credit-card-wrapper';
                    let cardImageUrl, bannerClass, bannerText, extraContent = '';

                    switch(loan.loanType) {
                        case '10 Days Credit':
                            cardImageUrl = "https://i.ibb.co/bjWtdV0L/1757738358948.jpg";
                            bannerClass = 'green';
                            const dueDate10 = new Date(loanDate);
                            dueDate10.setDate(dueDate10.getDate() + 10);
                            const daysRemaining10 = Math.max(0, Math.ceil((dueDate10 - today) / (1000 * 3600 * 24)));
                            bannerText = `Free period ends in ${daysRemaining10} ${daysRemaining10 === 1 ? 'day' : 'days'}`;
                            break;
                        case 'Grocery Credit':
                            cardImageUrl = "https://i.ibb.co/60sXyybn/20251006-155008.png";
                            bannerClass = 'warning';
                            const dueDate30 = new Date(loanDate);
                            dueDate30.setDate(dueDate30.getDate() + 30);
                            const daysRemaining30 = Math.max(0, Math.ceil((dueDate30 - today) / (1000 * 3600 * 24)));
                            bannerText = `Due in ${daysRemaining30} ${daysRemaining30 === 1 ? 'day' : 'days'}`;
                            if (today.getDate() >= 1 && today.getDate() <= 10) {
                                extraContent = `<div class="cc-pay-now">Pay Now</div>`;
                            }
                            break;
                        case 'Recharge':
                            cardImageUrl = "https://i.ibb.co/p7pVDLx/IMG-20250922-104425.jpg";
                            bannerClass = 'warning';
                            bannerText = `Recharge taken ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
                            extraContent = `<div class="cc-telecom-logo">${loan.telecomCompany || ''}</div>`;
                            break;
                    }

                    card.innerHTML = `
                        <div class="credit-card-image-bg" style="background-image: url('${cardImageUrl}')">
                            <div class="cc-content">
                                <div class="cc-profile-pic"><img src="${profilePic}" alt="${loan.memberName}"></div>
                                ${extraContent}
                                <div class="cc-member-name">${loan.memberName}</div>
                                <div class="cc-amount-group"><div class="cc-value">₹${parseFloat(loan.outstandingAmount).toLocaleString('en-IN')}</div></div>
                            </div>
                        </div>
                        <div class="pending-banner ${bannerClass}">${ICONS.clock}<span>${bannerText}</span></div>`;
                } else { 
                    card.className = 'loan-card';
                    const formattedDate = loanDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    
                    let bannerClass = 'green';
                    if (daysAgo > 85) bannerClass = 'danger';
                    else if (daysAgo > 60) bannerClass = 'warning';
                    const bannerText = `Loan taken ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
                    
                    let extraDetails = '';
                    let productImageHtml = '';

                    if (loan.loanType === 'Personal Loan') {
                        const loanAmount = parseFloat(loan.outstandingAmount);
                        let interestRate = 0;

                        if (daysAgo >= 1 && daysAgo <= 30) {
                            interestRate = 0.01; // 1%
                        } else if (daysAgo >= 31 && daysAgo <= 60) {
                            interestRate = 0.03; // 3%
                        } else if (daysAgo >= 61 && daysAgo <= 90) {
                            interestRate = 0.05; // 5%
                        } else if (daysAgo >= 91 && daysAgo <= 100) {
                            interestRate = 0.055; // 5.5%
                        } else if (daysAgo > 100) {
                            interestRate = 0.06; // 6%
                        }

                        if (interestRate > 0) {
                            const interestAmount = loanAmount * interestRate;
                            extraDetails += `
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.interest} Interest Amount:</span>
                                    <span class="detail-value amount">₹${interestAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>`;
                        }
                        
                        if (daysAgo > 100) {
                            bannerClass = 'danger blinking-banner';
                        }
                    }
                    else if (loan.loanType === 'Product on EMI' && loan.productDetails) {
                        extraDetails = `
                            <div class="detail-row">
                                <span class="detail-label">${ICONS.product} Product:</span>
                                <span class="detail-value">${loan.productDetails.name}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${ICONS.money} Monthly EMI:</span>
                                <span class="detail-value amount">₹${parseFloat(loan.productDetails.monthlyEmi).toLocaleString('en-IN')}</span>
                            </div>`;
                        
                        if (loan.productDetails.imageUrl) {
                            productImageHtml = `<div class="cc-product-image"><img src="${loan.productDetails.imageUrl}" alt="Product Image"></div>`;
                        } else {
                            productImageHtml = `<div class="cc-product-image">${ICONS.product}</div>`;
                        }
                    } 
                    else if (loan.loanType === 'Business Loan') {
                        const loanAmount = parseFloat(loan.outstandingAmount);
                        let processingFee = (loanAmount > 9000) ? (loanAmount * 0.01) + 200 : (loanAmount * 0.01);

                        let monthlyPaymentHtml = '';
                        const monthlyInterest = loanAmount * 0.015;

                        if (daysAgo <= 90) {
                            monthlyPaymentHtml = `
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.interest} Monthly Interest:</span>
                                    <span class="detail-value amount">₹${monthlyInterest.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>`;
                        } else {
                            const totalEmi = (loanAmount / 6) + monthlyInterest;
                            monthlyPaymentHtml = `
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.emi} Monthly EMI:</span>
                                    <span class="detail-value amount">₹${totalEmi.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>`;
                        }

                        extraDetails = `
                            <div class="detail-row">
                                <span class="detail-label">${ICONS.processing} Processing Fee:</span>
                                <span class="detail-value amount">₹${processingFee.toLocaleString('en-IN')}</span>
                            </div>
                            ${monthlyPaymentHtml}
                        `;
                    }

                    card.innerHTML = `
                        <div class="card-main-content">
                            <button class="card-download-btn" data-card-id="${cardId}" title="Download Card">${ICONS.download}</button>
                            ${productImageHtml}
                            <div class="card-top">
                                <div class="profile-picture"><img src="${profilePic}" alt="${loan.memberName}"></div>
                                <div class="user-details">
                                    <h3>${loan.memberName}</h3>
                                    <div class="loan-date">${ICONS.calendar} Loan Date: ${formattedDate}</div>
                                </div>
                            </div>
                            <div class="card-middle">
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.money} Outstanding Amount:</span>
                                    <span class="detail-value amount">₹${parseFloat(loan.outstandingAmount).toLocaleString('en-IN')}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">${ICONS.tag} Loan Type:</span>
                                    <span class="detail-value loan-type-value">${loan.loanType}</span>
                                </div>
                                ${extraDetails}
                            </div>
                        </div>
                        <div class="pending-banner ${bannerClass}">${ICONS.clock}<span>${bannerText}</span></div>`;
                }
                container.appendChild(card);
            });
        }
        
        function populateMembersDropdown() {
            const { memberSelect } = state.ui;
            memberSelect.innerHTML = '<option value="">-- Choose a member --</option>';
            const sortedMembers = Object.entries(state.membersData)
                .filter(([id, member]) => member.status === 'Approved')
                .sort(([, a], [, b]) => a.fullName.localeCompare(b.fullName));

            sortedMembers.forEach(([memberId, member]) => {
                const option = document.createElement('option');
                option.value = memberId;
                option.textContent = member.fullName;
                option.dataset.profilePic = member.profilePicUrl || '';
                memberSelect.appendChild(option);
            });
        }

        function setupModalEventListeners() {
            const { modal, openModalBtn, closeModalBtn, memberSelect, creditAmountInput, generateCardBtn, modalStatus, generatedCardContainer, cardTypeSelect, amountFields, rechargeFields } = state.ui;

            openModalBtn.addEventListener('click', () => {
                cardTypeSelect.value = 'credit';
                cardTypeSelect.dispatchEvent(new Event('change'));
                memberSelect.value = '';
                creditAmountInput.value = '';
                creditAmountInput.disabled = true;
                creditAmountInput.placeholder = 'Select a member first';
                generatedCardContainer.innerHTML = '';
                modalStatus.textContent = '';
                modal.classList.add('visible');
            });
            
            closeModalBtn.addEventListener('click', () => modal.classList.remove('visible'));
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });

            memberSelect.addEventListener('change', () => {
                creditAmountInput.disabled = !memberSelect.value;
                creditAmountInput.placeholder = memberSelect.value ? 'Enter amount' : 'Select a member first';
            });
            
            cardTypeSelect.addEventListener('change', () => {
                const cardType = cardTypeSelect.value;
                const isRecharge = (cardType === 'recharge');
                
                rechargeFields.style.display = isRecharge ? 'block' : 'none';
                amountFields.style.display = 'block';
                
                modalTitle.textContent = `Generate ${cardType.replace('-', ' ')} Card`;
                generateCardBtn.textContent = `Generate ${cardType.replace('-', ' ')} Card`;
            });
            
            generateCardBtn.addEventListener('click', () => {
                const cardType = cardTypeSelect.value;
                const memberId = memberSelect.value;
                const selectedOption = memberSelect.options[memberSelect.selectedIndex];

                if (!memberId) {
                    modalStatus.textContent = 'Please select a member.';
                    modalStatus.style.color = 'red';
                    return;
                }
                
                const amount = parseFloat(creditAmountInput.value);
                if (isNaN(amount) || amount <= 0) {
                    modalStatus.textContent = 'Please enter a valid amount.';
                    modalStatus.style.color = 'red';
                    return;
                }
                
                modalStatus.textContent = 'Generating card...';
                modalStatus.style.color = 'var(--text-light)';

                let loanType;
                if(cardType === 'credit') loanType = '10 Days Credit';
                else if (cardType === 'grocery') loanType = 'Grocery Credit';
                else loanType = 'Recharge';

                const loanData = {
                    memberName: selectedOption.textContent,
                    loanType: loanType,
                    originalAmount: amount,
                    telecomCompany: (cardType === 'recharge') ? state.ui.telecomSelect.value : null
                };

                generateVisualCard(loanData, selectedOption.dataset.profilePic);
                modalStatus.textContent = 'Card generated successfully!';
                modalStatus.style.color = 'var(--success-color)';
            });
        }
        
        function generateVisualCard(loanData, profilePicUrl) {
            const { generatedCardContainer } = state.ui;
            let cardImageUrl = '';
            let extraContent = '';
            
            const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(loanData.memberName)}&background=4f46e5&color=fff&size=50`;
            const profilePic = profilePicUrl || defaultPic;
            
            switch(loanData.loanType) {
                case '10 Days Credit':
                    cardImageUrl = "https://i.ibb.co/bjWtdV0L/1757738358948.jpg";
                    break;
                case 'Grocery Credit':
                    cardImageUrl = "https://i.ibb.co/60sXyybn/20251006-155008.png";
                    const today = new Date();
                    if (today.getDate() >= 1 && today.getDate() <= 10) {
                        extraContent = `<div class="cc-pay-now">Pay Now</div>`;
                    }
                    break;
                case 'Recharge':
                    cardImageUrl = "https://i.ibb.co/p7pVDLx/IMG-20250922-104425.jpg";
                    extraContent = `<div class="cc-telecom-logo">${loanData.telecomCompany}</div>`;
                    break;
            }

            let cardContentHtml = `
                <div class="cc-profile-pic"><img src="${profilePic}" alt="${loanData.memberName}"></div>
                ${extraContent}
                <div class="cc-member-name">${loanData.memberName}</div>
                <div class="cc-amount-group"><div class="cc-value">₹${loanData.originalAmount.toLocaleString('en-IN')}</div></div>
            `;

            generatedCardContainer.innerHTML = `
                <div id="card-to-share" class="credit-card-wrapper" style="margin: 0 auto;">
                   <div class="credit-card-image-bg" style="background-image: url('${cardImageUrl}');">
                      <div class="cc-content">${cardContentHtml}</div>
                   </div>
                </div>
                <div class="action-buttons">
                    <button class="modal-btn" id="download-btn">Download Card</button>
                    <button class="modal-btn" id="share-btn">Share on WhatsApp</button>
                </div>`;
            
            document.getElementById('download-btn').addEventListener('click', () => handleCardAction('download'));
            document.getElementById('share-btn').addEventListener('click', () => handleCardAction('share'));
        }

        async function handleCardAction(action) {
            const cardElement = document.getElementById('card-to-share');
            const statusEl = state.ui.modalStatus;
            statusEl.textContent = "Preparing image...";
            statusEl.style.color = 'var(--text-light)';

            try {
                const scale = action === 'download' ? 4 : 2;
                
                const canvas = await html2canvas(cardElement, { 
                    useCORS: true, 
                    scale: scale, 
                    backgroundColor: null
                });
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                
                if (action === 'download') {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `card-${Date.now()}.png`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                    statusEl.textContent = "Image downloaded in high quality!";
                    statusEl.style.color = 'var(--success-color)';
                } else if (action === 'share') {
                    const file = new File([blob], 'card.png', { type: 'image/png' });
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                         await navigator.share({ files: [file], title: 'Generated Card' });
                         statusEl.textContent = "Shared successfully!";
                         statusEl.style.color = 'var(--success-color)';
                    } else {
                        statusEl.textContent = 'Sharing not supported. Please download.';
                        statusEl.style.color = 'var(--warning-color)';
                    }
                }
            } catch (err) {
                console.error('Action failed:', err);
                statusEl.textContent = 'Could not generate image.';
                statusEl.style.color = 'red';
            }
        }
        
        function downloadCardAsImage(cardId) {
            const cardElement = document.getElementById(cardId);
            if (!cardElement) return;

            html2canvas(cardElement, { 
                useCORS: true,
                scale: 4, 
                onclone: (document) => {
                    const button = document.querySelector(`#${cardId} .card-download-btn`);
                    if(button) button.style.display = 'none';
                }
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `${cardId}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        }

        function setupEventListeners() {
             state.ui.searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                const filteredLoans = state.allActiveLoans.filter(loan => 
                    loan.memberName.toLowerCase().includes(searchTerm)
                );
                displayLoanCards(filteredLoans);
            });
            
            state.ui.container.addEventListener('click', function(event) {
                const downloadButton = event.target.closest('.card-download-btn');
                if (downloadButton) {
                    const cardId = downloadButton.dataset.cardId;
                    downloadCardAsImage(cardId);
                }
            });
        }
        
        fetchAndProcessData();
        setupEventListeners();
        setupModalEventListeners();
    }
    
    checkAuthAndInitialize();
});


