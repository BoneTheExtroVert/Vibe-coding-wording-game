document.addEventListener('DOMContentLoaded', () => {
    // --- Global styles and handlers for drag and drop operations ---
    
    // Create a style sheet with highest priority cursor rules
    const styleSheet = document.createElement('style');
    styleSheet.innerHTML = `
      
    `;
    document.head.appendChild(styleSheet);
    
    // Refined Global dragover
    document.addEventListener('dragover', function(e) {
        e.preventDefault(); // Necessary to allow drop in general for drop events to fire

        if (currentlyDraggedChoiceIndex !== -1) { // Check if we are dragging one of our blocks
            // DO NOT set e.dataTransfer.dropEffect here.
            // Let specific handlers like handleDragOverBoardCell manage it.

            // Update custom ghost position
            if (activeCustomGhost) {
                activeCustomGhost.style.left = e.clientX + 'px';
                activeCustomGhost.style.top = e.clientY + 'px';
            }
        }
        // If not dragging one of our blocks, allow default browser behavior or other handlers
    }, false); 

    // Global drop handler - mostly to prevent drops on unwanted areas
    document.addEventListener('drop', function(e) {
        // Allow drops on grid-cells (handled by cell's own drop listener)
        // and choice-block-displays (no drop action, but prevents default error)
        if (e.target.closest('.grid-cell') || e.target.closest('.choice-block-display')) {
            return; 
        }
        e.preventDefault(); // Prevent default for other areas
    }, false);
    
    // --- Constants ---
    const MAIN_BOARD_WIDTH = 9;
    const MAIN_BOARD_HEIGHT = 9;
    const TWL_FILE_NAME = "wordlist.txt";
    const HIGH_SCORE_KEY = 'wordGridHighScore_v2'; // New key for new game version

    // Block shape templates (as masks, letters will be random)
    const BLOCK_SHAPE_TEMPLATES = {
        "L_shape_4_letter": {
            name: "L-Shape (4)",
            shape: [[true, false], [true, false], [true, true]]
        },
        "L_shape_3_letter": {
            name: "L-Shape (3)",
            shape: [[true, false], [true, true]]
        },
        "Square_shape": {
            name: "Square",
            shape: [[true, true], [true, true]]
        },
        "Single_shape": { 
            name: "Single",
            shape: [[true]]
        },
        "Double_shape": { 
            name: "Double",
            shape: [[true, true]]
        },
        "Triple_shape": {
            name: "Triple",
            shape: [[true], [true], [true]]
        }
    };
    const TEMPLATE_KEYS = Object.keys(BLOCK_SHAPE_TEMPLATES);

    // --- Game State Variables ---
    let mainBoardData = []; // 2D array for the 6x6 main board
    let choosableBlocks = [null, null, null]; // Array to hold the 3 current choosable block objects
    let currentScore = 0;
    let highScore = 0;
    let discardCount = 5; // Initialize discard count
    const INITIAL_DISCARD_COUNT = 5;
    const DISCARDS_GAINED_PER_WORD_SCORE = 2;
    let validWords = new Set();
    let isGameOver = false;
    let scoredWordsHistory = []; // Array to track scored words
    let currentPreviewCells = []; // Store {r, c} of cells currently showing preview
    let selectedChoiceIndex = -1; // RE-INTRODUCED: Index of the selected choosable block
    let activeCustomGhost = null; // To hold our custom ghost element
    let transparentPixelElement = null; // For hiding default browser drag image

    // Add the missing variable declarations
    let clearRowModeActive = false;
    let clearColumnModeActive = false;
    let boardActionsCount = 3; // Start with 3 actions

    // --- DOM Elements ---
    const mainBoardElement = document.getElementById('main-game-board');
    const choiceBlockElements = [
        document.getElementById('choice-block-0'),
        document.getElementById('choice-block-1'),
        document.getElementById('choice-block-2')
    ];
    const scoreElement = document.getElementById('score');
    const highScoreElement = document.getElementById('high-score');
    const gameMessageElement = document.getElementById('game-message');
    const restartButton = document.getElementById('restart-button');
    const newRotateButton = document.getElementById('new-rotate-button');
    const discardButton = document.getElementById('discard-button');
    const discardCountElement = document.getElementById('discard-count');
    const scoredWordsListElement = document.getElementById('scored-words-list');
    const clearRowButton = document.getElementById('clear-row-button');
    const clearColumnButton = document.getElementById('clear-column-button');
    const boardActionsCountElement = document.getElementById('board-actions-count');

    // Modal elements
    const allWordsModal = document.getElementById('all-words-modal');
    const allWordsModalList = document.getElementById('all-words-modal-list');
    const closeModalButton = allWordsModal.querySelector('.close-button');
    const showAllWordsButton = document.getElementById('show-all-words-button');

    // Add to DOM Elements section
    const swapLettersButton = document.getElementById('swap-letters-button');

    // Add variables for swap mode
    let swapModeActive = false;
    let firstSwapCell = null;
    let firstSwapPosition = null;

    // --- Utility Functions ---
    let weightedLetterPool = "";
    let weightedBlockShapePool = ""; // For weighted block shape generation

    function initializeWeightedLetters() {
        const lettersConfig = [
            { chars: "AEIOU", weight: 39 },         // Vowels (target 30%)
            { chars: "RSTLNMCDGHBPF", weight: 30 },// Common Consonants
            { chars: "YVK", weight: 20 },           // Less Common Consonants
            { chars: "ZXQJW", weight: 1 }          // Rare Letters (significantly reduced chance)
        ];

        let pool = "";
        lettersConfig.forEach(group => {
            for (const char of group.chars) {
                pool += char.repeat(group.weight);
            }
        });
        weightedLetterPool = pool;
        // console.log("Weighted letter pool initialized. Length:", weightedLetterPool.length, "Pool:", weightedLetterPool);
    }

    function initializeWeightedBlockShapes() {
        const shapeConfig = [
          
            { key: "Single_shape", weight: 30 },
            { key: "Double_shape", weight: 50},     
            { key: "Triple_shape", weight: 3 },   
            { key: "L_shape_3_letter", weight: 3 }, 
            { key: "Square_shape", weight: 1 }, 
            { key: "L_shape_4_letter", weight: 1}  
        ];

        let pool = [];
        shapeConfig.forEach(group => {
            for (let i = 0; i < group.weight; i++) {
                pool.push(group.key);
            }
        });
        weightedBlockShapePool = pool;
    }

    function getRandomLetter(usedLetters = []) {
        if (weightedLetterPool === "") {
            initializeWeightedLetters(); // Initialize on first call
        }
        
        // Create a pool without the used letters
        let availablePool = weightedLetterPool.split('').filter(letter => !usedLetters.includes(letter));
        
        if (availablePool.length === 0) {
            console.error("No unique letters available, falling back to random letter");
            return weightedLetterPool[Math.floor(Math.random() * weightedLetterPool.length)];
        }
        
        return availablePool[Math.floor(Math.random() * availablePool.length)];
    }

    // --- Initialization ---
    async function startGame() {
        console.log("Starting new game...");
        isGameOver = false;
        currentScore = 0;
        discardCount = INITIAL_DISCARD_COUNT;
        boardActionsCount = 3; // Reset board actions
        scoredWordsHistory = [];
        updateScoreDisplay();
        updateDiscardCountDisplay();
        updateBoardActionsCount();
        renderScoredWordsList();
        loadHighScore();

        // Initialize main board data
        mainBoardData = Array(MAIN_BOARD_HEIGHT).fill(null).map(() => Array(MAIN_BOARD_WIDTH).fill(null));
        renderMainBoard();

        // Initialize choosable blocks
        await populateChoosableBlocks();
        clearActiveBlockSelection();

        // Reset clear modes
        deactivateClearModes();

        // Reset swap mode
        deactivateSwapMode();

        // Load word list (if not already loaded)
        if (validWords.size === 0) {
            await loadWordList();
        }
        
        if (!transparentPixelElement) {
            transparentPixelElement = document.createElement('img');
            transparentPixelElement.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }

        if (!eventListenersInitialized) {
            setupInitialEventListeners(); 
        }
        
        enableGameControls();
    }
    
    function updateDiscardCountDisplay() {
        discardCountElement.textContent = discardCount;
    }

    function enableGameControls() {
        newRotateButton.disabled = true;
        discardButton.disabled = true;
        restartButton.disabled = false;
        clearRowButton.disabled = false;
        clearColumnButton.disabled = false;
        swapLettersButton.disabled = false;
        choiceBlockElements.forEach(el => {
            el.style.pointerEvents = 'auto';
            el.draggable = true;
        });
    }

    function disableGameControlsForGameOver() {
        newRotateButton.disabled = true;
        discardButton.disabled = true;
        clearRowButton.disabled = true;
        clearColumnButton.disabled = true;
        swapLettersButton.disabled = true;
        choiceBlockElements.forEach(el => {
            el.style.pointerEvents = 'none';
            el.draggable = false;
        });
    }

    // --- Core Game Logic (Stubs for now, to be implemented) ---

    async function loadWordList() {
        console.log("LOAD_WORDS: Attempting to load word list from:", TWL_FILE_NAME);
        try {
            const response = await fetch(TWL_FILE_NAME);
            console.log("LOAD_WORDS: Fetch response status:", response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for ${TWL_FILE_NAME}`);
            }
            const text = await response.text();
            console.log("LOAD_WORDS: Raw text fetched (first 500 chars):", text.substring(0, 500));
            
            const rawWordsArray = text.split(/\r?\n/).map(word => word.trim().toUpperCase());
            console.log("LOAD_WORDS: Words array after split & trim/uppercase (length):", rawWordsArray.length);
            if (rawWordsArray.length > 0 && rawWordsArray.length < 20) {
                 console.log("LOAD_WORDS: Content of rawWordsArray (first few):", rawWordsArray.slice(0,10));
            }

            const filteredWords = rawWordsArray.filter(word => {
                const isValid = word.length >= 3;
                return isValid; 
            });
            console.log("LOAD_WORDS: Words array after filtering for length >= 3 (length):", filteredWords.length);
            if (filteredWords.length > 0 && filteredWords.length < 20) {
                 console.log("LOAD_WORDS: Content of filteredWords (first few):", filteredWords.slice(0,10));
            }

            validWords = new Set(filteredWords);
            console.log("LOAD_WORDS: Final validWords set populated. Size:", validWords.size);
            
            if (validWords.size === 0 && text.length > 0) {
                 console.warn("LOAD_WORDS: Word list file was read, but resulted in zero valid words after processing.");
            } else if (validWords.size === 0) {
                 console.warn("LOAD_WORDS: Word list processing resulted in zero valid words (empty file or parsing issues).");
            } else {
                console.log(`LOAD_WORDS: Successfully populated validWords with ${validWords.size} words from ${TWL_FILE_NAME}.`);
            }
        } catch (error) {
            console.error("LOAD_WORDS: CRITICAL ERROR loading external word list:", error.message);
            validWords.clear(); 
            // --- EMBEDDED FALLBACK WORDLIST --- 
            const embeddedFallbackWords = [ 
                "ACE", "ACT", "ADD", "AGE", "AGO", "AID", "AIM", "AIR", "ALL", "AND",
                "ANY", "ARM", "ART", "ASK", "BAD", "BAG", "BAR", "BED", "BEE", "BIG",
                "BIT", "BOX", "BOY", "BUY", "CAR", "CAT", "CUT", "DAD", "DAY", "DIE",
                "DOG", "DRY", "EAR", "EAT", "EGG", "END", "EYE", "FAR", "FIT", "FLY",
                "FOR", "GET", "GOD", "GUN", "HAT", "HIT", "HOT", "HOW", "ICE", "JOB",
                "KEY", "KID", "LAW", "LAY", "LEG", "LET", "LIE", "LOT", "LOW", "MAP",
                "MEN", "MOM", "NEW", "NOW", "OFF", "OIL", "OLD", "ONE", "OUT", "OWN",
                "PAY", "PEN", "PET", "PIE", "PIN", "PUT", "RED", "RUN", "SAY", "SEA", "SEE",
                "SET", "SIT", "SKY", "SON", "SUN", "TAX", "TEA", "TEN", "TOP", "TRY",
                "TWO", "USE", "WAR", "WAY", "WHO", "WHY", "WIN", "YES", "YET", "YOU",
                "GAME", "WORD", "LIST", "TEST", "CODE", "PLAY", "GOOD", "LUCK"
            ];
            validWords = new Set(embeddedFallbackWords.map(w => w.toUpperCase()));
            console.log("LOAD_WORDS: Using embedded fallback word list. Size:", validWords.size);
        }
    }

    function updateScoreDisplay() {
        scoreElement.textContent = currentScore;
    }

    function loadHighScore() {
        const stored = localStorage.getItem(HIGH_SCORE_KEY);
        highScore = stored ? parseInt(stored, 10) : 0;
        highScoreElement.textContent = highScore;
    }

    function saveHighScore() {
        localStorage.setItem(HIGH_SCORE_KEY, highScore.toString());
    }

    // --- Rendering Functions ---
    function renderMainBoard() {
        mainBoardElement.innerHTML = ''; 
        mainBoardElement.style.gridTemplateColumns = `repeat(${MAIN_BOARD_WIDTH}, 1fr)`;
        mainBoardElement.style.gridTemplateRows = `repeat(${MAIN_BOARD_HEIGHT}, 1fr)`;

        for (let r = 0; r < MAIN_BOARD_HEIGHT; r++) {
            for (let c = 0; c < MAIN_BOARD_WIDTH; c++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.textContent = mainBoardData[r][c] || ''; 
                
                // --- Drag and Drop Listeners (Modified) ---
                cell.addEventListener('dragover', handleDragOverBoardCell);
                cell.addEventListener('dragleave', handleDragLeaveBoardCell); // Add dragleave
                cell.addEventListener('drop', handleDropOnBoard);
                // Add click event listener for row clearing
                cell.addEventListener('click', handleCellClick);
                // ------------------------------------------
                mainBoardElement.appendChild(cell);
            }
        }
    }

    function generateBlockInstance(templateKey) {
        const template = BLOCK_SHAPE_TEMPLATES[templateKey];
        if (!template) {
            console.error(`Unknown block template key: ${templateKey}`);
            return null;
        }

        const newBlock = {
            id: templateKey + '_' + Date.now(),
            name: template.name,
            letters: []
        };

        // Keep track of letters used in this block
        const usedLetters = [];

        for (const shapeRow of template.shape) {
            const letterRow = [];
            for (const cellIsPartOfShape of shapeRow) {
                if (cellIsPartOfShape) {
                    const letter = getRandomLetter(usedLetters);
                    usedLetters.push(letter);
                    letterRow.push(letter);
                } else {
                    letterRow.push(null);
                }
            }
            newBlock.letters.push(letterRow);
        }
        return newBlock;
    }

    function renderSingleBlockDisplay(blockObject, domElement) {
        domElement.innerHTML = ''; 
        domElement.removeAttribute('style'); // Clear previous styles like grid templates

        if (!blockObject || !blockObject.letters) {
            // Still provide a minimum size visually even if empty
            domElement.style.minWidth = '85px'; 
            domElement.style.minHeight = '85px'; 
            return;
        }

        const blockLetters = blockObject.letters;
        const actualBlockRows = blockLetters.length;
        const actualBlockCols = actualBlockRows > 0 ? blockLetters[0].length : 0;

        if (actualBlockRows === 0 || actualBlockCols === 0) return; 

        // Create an inner container for the actual grid
        const innerGrid = document.createElement('div');
        innerGrid.style.display = 'grid'; // Make the inner div a grid
        innerGrid.style.gridTemplateColumns = `repeat(${actualBlockCols}, 1fr)`;
        innerGrid.style.gridTemplateRows = `repeat(${actualBlockRows}, 1fr)`;
        innerGrid.classList.add('block-inner-grid'); // Add a specific class for easier selection

        for (let r_block = 0; r_block < actualBlockRows; r_block++) {
            for (let c_block = 0; c_block < actualBlockCols; c_block++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                // Ensure centering for letters in choosable blocks
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';

                if (blockLetters[r_block][c_block]) {
                    cell.textContent = blockLetters[r_block][c_block];
                } else {
                    cell.style.visibility = 'hidden'; 
                }
                innerGrid.appendChild(cell); // Append cells to the inner grid
            }
        }
        
        domElement.appendChild(innerGrid); // Append the inner grid to the main element
    }

    function renderScoredWordsList() {
        scoredWordsListElement.innerHTML = ''; // Clear previous list
        const wordsToDisplay = scoredWordsHistory.slice(-3); // Get the last 3 words - REINSTATING THIS

        wordsToDisplay.forEach(word => { // Display only the selected words
            const li = document.createElement('li');
            li.textContent = word;
            scoredWordsListElement.appendChild(li);
        });
        // Optional: Scroll to bottom if list is long (less relevant now for main list)
        // scoredWordsListElement.parentElement.scrollTop = scoredWordsListElement.parentElement.scrollHeight;
    }

    async function populateChoosableBlocks() {
        if (weightedBlockShapePool.length === 0) {
            initializeWeightedBlockShapes(); // Initialize on first relevant call
        }
        // Force first block to be a 3-letter straight shape
        choosableBlocks[0] = generateBlockInstance("Triple_shape");
        renderSingleBlockDisplay(choosableBlocks[0], choiceBlockElements[0]);
        choiceBlockElements[0].draggable = true;

        // Generate random blocks for the remaining slots
        for (let i = 1; i < choosableBlocks.length; i++) {
            const randomTemplateKey = weightedBlockShapePool[Math.floor(Math.random() * weightedBlockShapePool.length)];
            choosableBlocks[i] = generateBlockInstance(randomTemplateKey);
            renderSingleBlockDisplay(choosableBlocks[i], choiceBlockElements[i]);
            choiceBlockElements[i].draggable = true;
        }
        console.log("Choosable blocks populated:", choosableBlocks);
    }

    function clearActiveBlockSelection() {
        choiceBlockElements.forEach(el => el.classList.remove('selected'));
        selectedChoiceIndex = -1;
        newRotateButton.disabled = true;
        discardButton.disabled = true;
        
        // Remove block-selected class from main board
        mainBoardElement.classList.remove('block-selected');
    }
    
    // --- Block Manipulation ---
    function rotateBlockClockwise(block) {
        if (!block || !block.letters || block.letters.length === 0) {
            return; // Nothing to rotate or invalid block
        }

        const originalLetters = block.letters;
        const numRows = originalLetters.length;
        const numCols = numRows > 0 ? originalLetters[0].length : 0;
        if (numCols === 0) return; // Empty block

        const rotatedLetters = Array(numCols).fill(null).map(() => Array(numRows).fill(null));

        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                rotatedLetters[c][numRows - 1 - r] = originalLetters[r][c];
            }
        }
        block.letters = rotatedLetters; // Update the block's letters in-place
    }

    // --- Event Listeners ---
    let eventListenersInitialized = false; // Flag to ensure listeners are set only once

    function setupInitialEventListeners() {
        if (eventListenersInitialized) return;

        choiceBlockElements.forEach((choiceElement, index) => {
            // CLICK to SELECT the block
            choiceElement.addEventListener('click', () => {
                if (isGameOver || !choosableBlocks[index]) return;
                selectedChoiceIndex = index;
                choiceBlockElements.forEach(el => el.classList.remove('selected'));
                choiceElement.classList.add('selected');
                newRotateButton.disabled = false; 
                discardButton.disabled = (discardCount <= 0);
                
                // Add block-selected class to main board to enable row highlighting
                mainBoardElement.classList.add('block-selected');
                
                showMessage("");
            });

            // DRAGSTART - Reverting to Default Browser Drag Image
            choiceElement.addEventListener('dragstart', (event) => {
                if (isGameOver || !choosableBlocks[index]) {
                    event.preventDefault();
                    return;
                }
                currentlyDraggedChoiceIndex = index; 
                document.body.classList.add('dragging-active');

                const choiceIndexString = index.toString();
                const elementToDrag = choiceElement.querySelector('.block-inner-grid') || choiceElement;

                try {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("text/plain", choiceIndexString);
                    console.log("DRAG_START_DEFAULT: Set data text/plain to:", choiceIndexString);

                    // Use the browser's default drag image generation
                    // Calculate offset to center the drag image on the cursor
                    const rect = elementToDrag.getBoundingClientRect();
                    const offsetX = event.clientX - rect.left; // Offset relative to element's top-left
                    const offsetY = event.clientY - rect.top;
                    event.dataTransfer.setDragImage(elementToDrag, offsetX, offsetY);
                    console.log("DRAG_START_DEFAULT: Using browser default drag image with offset", offsetX, offsetY);
                    
                    // Hide original element slightly later to allow drag image generation
                    setTimeout(() => {
                        choiceElement.style.visibility = 'hidden';
                        console.log("DRAG_START_DEFAULT: Original element hidden (via setTimeout).");
                    }, 0);

                } catch (e) {
                    console.error("DRAG_START_DEFAULT: Error during drag start process:", e);
                    // Ensure cleanup happens if error occurs
                    document.body.classList.remove('dragging-active');
                    choiceElement.style.visibility = 'visible'; 
                    currentlyDraggedChoiceIndex = -1;
                    // No activeCustomGhost to remove here
                }
            });
            
            // DRAGEND from the choice slot
            choiceElement.addEventListener('dragend', (event) => {
                choiceElement.style.visibility = 'visible'; // Show original choice block
                
                clearPlacementPreview(); 
                currentlyDraggedChoiceIndex = -1; 
                document.body.classList.remove('dragging-active');
            });
        });

        // Event listener for the NEW rotate button
        newRotateButton.addEventListener('click', () => {
            if (isGameOver || selectedChoiceIndex === -1 || !choosableBlocks[selectedChoiceIndex]) {
                return;
            }
            const blockToRotate = choosableBlocks[selectedChoiceIndex];
            rotateBlockClockwise(blockToRotate);
            renderSingleBlockDisplay(blockToRotate, choiceBlockElements[selectedChoiceIndex]); // Re-render in its choice slot
            console.log(`Choice block ${selectedChoiceIndex} rotated by button.`);
        });

        // Listener for the DISCARD button
        discardButton.addEventListener('click', () => {
            if (isGameOver || selectedChoiceIndex === -1 || discardCount <= 0) {
                console.log("Discard prevented: game over, no selection, or no discards left.");
                return;
            }

            console.log(`Discarding block at index ${selectedChoiceIndex}. Discards left: ${discardCount - 1}`);
            discardCount--;
            replaceChoosableBlock(selectedChoiceIndex); // Replace the discarded block
            clearActiveBlockSelection(); // Clear selection and disable buttons
            updateDiscardCountDisplay();
            showMessage(""); // Clear message area after discard
            // Consider if a game over check is needed here, though unlikely
            // handleTurnEnd(); 
        });

        restartButton.addEventListener('click', () => {
            startGame(); 
        });

        // --- Modal Event Listeners ---
        showAllWordsButton.addEventListener('click', () => {
            allWordsModalList.innerHTML = ''; // Clear previous list
            if (scoredWordsHistory.length === 0) {
                const li = document.createElement('li');
                li.textContent = "No words scored yet!";
                allWordsModalList.appendChild(li);
            } else {
                scoredWordsHistory.forEach(word => {
                    const li = document.createElement('li');
                    li.textContent = word;
                    allWordsModalList.appendChild(li);
                });
            }
            allWordsModal.style.display = 'block';
        });

        closeModalButton.addEventListener('click', () => {
            allWordsModal.style.display = 'none';
        });

        // Close modal if user clicks outside of the modal content
        window.addEventListener('click', (event) => {
            if (event.target === allWordsModal) {
                allWordsModal.style.display = 'none';
            }
        });
        
        // Add keyboard listener for 'R' key to restart game
        document.addEventListener('keydown', (event) => {
            if (isGameOver) return; // Don't handle most shortcuts if game is over
            
            const key = event.key.toLowerCase();
            
            // Handle restart (R) even if game is over
            if (key === 'r') {
                startGame();
                return;
            }
            
            // Handle action shortcuts
            if (key === 'q') {
                // Toggle row clear mode (Q)
                if (clearRowModeActive) {
                    deactivateClearModes();
                    showMessage("");
                } else {
                    // Check if we have actions left
                    if (boardActionsCount <= 0) {
                        showMessage("No board actions remaining! Score words to earn more.");
                        return;
                    }
                    // Deactivate any other modes first
                    deactivateSwapMode();
                    deactivateClearModes();
                    activateRowClearMode();
                }
                return;
            }
            
            if (key === 'w') {
                // Toggle column clear mode (W)
                if (clearColumnModeActive) {
                    deactivateClearModes();
                    showMessage("");
                } else {
                    // Check if we have actions left
                    if (boardActionsCount <= 0) {
                        showMessage("No board actions remaining! Score words to earn more.");
                        return;
                    }
                    // Deactivate any other modes first
                    deactivateSwapMode();
                    deactivateClearModes();
                    activateColumnClearMode();
                }
                return;
            }
            
            if (key === 'e') {
                // Toggle swap mode (E)
                if (swapModeActive) {
                    deactivateSwapMode();
                    showMessage("");
                } else {
                    // Check if we have actions left
                    if (boardActionsCount <= 0) {
                        showMessage("No board actions remaining! Score words to earn more.");
                        return;
                    }
                    // Deactivate any other modes first
                    deactivateClearModes();
                    deactivateSwapMode();
                    activateSwapMode();
                }
                return;
            }
            
            // Add number key handlers for block selection (1, 2, 3)
            const keyNum = parseInt(event.key);
            if (keyNum >= 1 && keyNum <= 3 && !isGameOver) {
                const index = keyNum - 1;
                if (choosableBlocks[index]) {
                    selectedChoiceIndex = index;
                    choiceBlockElements.forEach(el => el.classList.remove('selected'));
                    choiceBlockElements[index].classList.add('selected');
                    newRotateButton.disabled = false;
                    discardButton.disabled = (discardCount <= 0);
                    
                    // Add block-selected class to main board to enable row highlighting
                    mainBoardElement.classList.add('block-selected');
                    
                    showMessage("");
                }
                return;
            }

            // Handle rotate with 'F' key
            if (key === 'f') {
                if (!isGameOver && selectedChoiceIndex !== -1 && !newRotateButton.disabled) {
                    const blockToRotate = choosableBlocks[selectedChoiceIndex];
                    rotateBlockClockwise(blockToRotate);
                    renderSingleBlockDisplay(blockToRotate, choiceBlockElements[selectedChoiceIndex]);
                }
                return;
            }

            // Handle discard with 'G' key
            if (key === 'g') {
                if (!isGameOver && selectedChoiceIndex !== -1 && discardCount > 0) {
                    discardCount--;
                    replaceChoosableBlock(selectedChoiceIndex);
                    clearActiveBlockSelection();
                    updateDiscardCountDisplay();
                    showMessage("");
                }
            }
        });
        
        // Add event listeners for clear row and column buttons
        clearRowButton.addEventListener('click', () => {
            if (isGameOver) return;
            
            if (boardActionsCount <= 0) {
                showMessage("No board actions remaining! Score words to earn more.");
                deactivateClearModes();
                deactivateSwapMode();
                return;
            }
            
            if (clearRowModeActive) {
                deactivateClearModes();
                showMessage("");
            } else {
                // Deactivate any other modes first
                deactivateSwapMode();
                deactivateClearModes();
                activateRowClearMode();
            }
        });
        
        clearColumnButton.addEventListener('click', () => {
            if (isGameOver) return;
            
            if (boardActionsCount <= 0) {
                showMessage("No board actions remaining! Score words to earn more.");
                deactivateClearModes();
                deactivateSwapMode();
                return;
            }
            
            if (clearColumnModeActive) {
                deactivateClearModes();
                showMessage("");
            } else {
                // Deactivate any other modes first
                deactivateSwapMode();
                deactivateClearModes();
                activateColumnClearMode();
            }
        });
        
        // Add event listener for the swap letters button
        swapLettersButton.addEventListener('click', () => {
            if (isGameOver) return;
            
            if (swapModeActive) {
                deactivateSwapMode();
                showMessage("");
            } else {
                // Check if we have actions left
                if (boardActionsCount <= 0) {
                    showMessage("No board actions remaining! Score words to earn more.");
                    return;
                }
                // Deactivate any other modes first
                deactivateClearModes();
                deactivateSwapMode();
                activateSwapMode();
            }
        });
        
        eventListenersInitialized = true;
        console.log("Initial event listeners (custom drag image) set up.");
    }

    // --- Drop Handling ---
    function handleDropOnBoard(event) {
        if (isGameOver) return;
        
        // If any action mode is active, deactivate it first
        if (clearRowModeActive || clearColumnModeActive || swapModeActive) {
            deactivateClearModes();
            deactivateSwapMode();
        }
        
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        console.log("DROP_DEBUG: Drop event triggered.");
        console.log("DROP_DEBUG: Available data types from drag operation:", Array.from(event.dataTransfer.types));

        const targetCell = event.target.classList.contains('grid-cell') ? event.target : event.target.closest('.grid-cell');
        if (!targetCell) {
            console.error("DROP_DEBUG: Drop target is not a cell.");
            return;
        }

        const targetRow = parseInt(targetCell.dataset.row, 10);
        const targetCol = parseInt(targetCell.dataset.col, 10);

        const rawTextData = event.dataTransfer.getData("text/plain");
        console.log("DROP_DEBUG: Raw data received for 'text/plain':", JSON.stringify(rawTextData)); // Stringify to see content like "" vs null

        if (rawTextData === null || rawTextData.trim() === "") {
            console.error("DROP_DEBUG: Received empty or no data for 'text/plain'.");
            showMessage("Drag-and-drop error: Data transfer failed (text/plain). Please try selecting the block again.", true);
            clearActiveBlockSelection();
            return;
        }

        const draggedChoiceIndex = parseInt(rawTextData, 10);

        if (isNaN(draggedChoiceIndex)) {
            console.error("DROP_DEBUG: Failed to parse choiceIndex from text/plain data:", rawTextData);
            showMessage("Drag-and-drop error: Corrupted data (text/plain). Please try again.", true);
            return;
        }
        
        console.log("DROP_DEBUG: Successfully parsed choiceIndex from text/plain:", draggedChoiceIndex);

        if (draggedChoiceIndex < 0 || draggedChoiceIndex >= choosableBlocks.length || !choosableBlocks[draggedChoiceIndex]) {
            console.error(`DROP_DEBUG: Invalid or out-of-bounds dragged block index (${draggedChoiceIndex}) from text/plain.`);
            showMessage("Drag-and-drop error: Invalid block data after transfer. Please try again.", true);
            return;
        }

        const blockToPlace = choosableBlocks[draggedChoiceIndex];

        console.log(`DROP_DEBUG: Attempting to place block '${blockToPlace.name}' (choice #${draggedChoiceIndex}) at (Row: ${targetRow}, Col: ${targetCol})`);
        console.log("DROP_DEBUG: Block letters:", JSON.stringify(blockToPlace.letters));

        if (canPlaceBlockOnMainBoard(mainBoardData, blockToPlace, targetRow, targetCol)) {
            clearPlacementPreview(); // Clear preview before placing
            placeActualBlockOnMainBoard(mainBoardData, blockToPlace, targetRow, targetCol);
            renderMainBoard();

            const wordsFound = findWordsOnMainBoard(mainBoardData);
            if (wordsFound.length > 0) {
                const turnScore = processFoundWordsAndScore(mainBoardData, wordsFound);
                renderMainBoard(); // Re-render after clearing words
                showMessage(`Words found! Score this turn: ${turnScore}`);
            } else {
               
            }

            replaceChoosableBlock(draggedChoiceIndex);
            clearActiveBlockSelection(); // Use the renamed function
            handleTurnEnd(); // Checks for game over and updates UI

        } else {
            clearPlacementPreview(); // Clear preview even if drop failed
            console.log("DROP_DEBUG: canPlaceBlockOnMainBoard returned FALSE");
            showMessage("Cannot place block here. Out of bounds or overlaps.", true);
        }
    }

    // --- Placement and Word Logic ---
    function canPlaceBlockOnMainBoard(board, block, targetRow, targetCol) {
        if (!block || !block.letters) {
            console.log("CAN_PLACE_DEBUG: Block or block.letters is null/undefined.");
            return false;
        }
        const blockLetters = block.letters;
        console.log(`CAN_PLACE_DEBUG: Checking block at (TRow: ${targetRow}, TCol: ${targetCol}). Block shape: ${blockLetters.length}x${blockLetters[0]?.length || 0}`);

        for (let r_block = 0; r_block < blockLetters.length; r_block++) {
            for (let c_block = 0; c_block < blockLetters[r_block].length; c_block++) {
                if (blockLetters[r_block][c_block]) { 
                    const boardR = targetRow + r_block;
                    const boardC = targetCol + c_block;
                    // console.log(`CAN_PLACE_DEBUG: Checking block cell (${r_block},${c_block}) -> board cell (${boardR},${boardC}). Letter: ${blockLetters[r_block][c_block]}`);

                    if (boardR < 0 || boardR >= MAIN_BOARD_HEIGHT || boardC < 0 || boardC >= MAIN_BOARD_WIDTH) {
                        console.log(`CAN_PLACE_DEBUG: Out of bounds at board cell (${boardR},${boardC}) for block cell (${r_block},${c_block}).`);
                        return false; 
                    }
                    if (board[boardR][boardC]) {
                        console.log(`CAN_PLACE_DEBUG: Overlap at board cell (${boardR},${boardC}) for block cell (${r_block},${c_block}). Board has: ${board[boardR][boardC]}`);
                        return false; 
                    }
                }
            }
        }
        console.log("CAN_PLACE_DEBUG: All checks passed, placement is valid.");
        return true; 
    }

    function placeActualBlockOnMainBoard(board, block, targetRow, targetCol) {
        if (!block || !block.letters) return;
        const blockLetters = block.letters;
        for (let r_block = 0; r_block < blockLetters.length; r_block++) {
            for (let c_block = 0; c_block < blockLetters[r_block].length; c_block++) {
                if (blockLetters[r_block][c_block]) {
                    board[targetRow + r_block][targetCol + c_block] = blockLetters[r_block][c_block];
                }
            }
        }
    }

    function findWordsOnMainBoard(board) {
        console.log("FIND_WORDS: Entered findWordsOnMainBoard. validWords size:", validWords.size, "Is 'DAD' in validWords at this point?", validWords.has("DAD"));
        console.log("FIND_WORDS: Current board state:", JSON.parse(JSON.stringify(board)));
        const foundWordsDetails = [];
        if (validWords.size === 0) {
            console.log("FIND_WORDS: Exiting early because validWords is empty.");
            return foundWordsDetails;
        }
        // Scan Rows
        for (let r = 0; r < MAIN_BOARD_HEIGHT; r++) {
            for (let cStart = 0; cStart < MAIN_BOARD_WIDTH; cStart++) {
                let currentWordStr = "";
                let currentCoords = [];
                let lastValidWordInSegment = null;

                for (let c = cStart; c < MAIN_BOARD_WIDTH; c++) {
                    const cell = board[r][c];
                    if (cell) {
                        currentWordStr += cell;
                        currentCoords.push({ r, c });
                        if (currentWordStr.length >= 3 && validWords.has(currentWordStr)) {
                            lastValidWordInSegment = {
                                word: currentWordStr,
                                coords: [...currentCoords],
                                orientation: "horizontal"
                            };
                        }
                    } else {
                        break; // End of segment
                    }
                }
                if (lastValidWordInSegment) {
                    foundWordsDetails.push(lastValidWordInSegment);
                }
            }
        }

        // Scan Columns
        for (let c = 0; c < MAIN_BOARD_WIDTH; c++) {
            for (let rStart = 0; rStart < MAIN_BOARD_HEIGHT; rStart++) {
                let currentWordStr = "";
                let currentCoords = [];
                let lastValidWordInSegment = null;

                for (let r = rStart; r < MAIN_BOARD_HEIGHT; r++) {
                    const cell = board[r][c];
                    if (cell) {
                        currentWordStr += cell;
                        currentCoords.push({ r, c });
                        if (currentWordStr.length >= 3 && validWords.has(currentWordStr)) {
                            lastValidWordInSegment = {
                                word: currentWordStr,
                                coords: [...currentCoords],
                                orientation: "vertical"
                            };
                        }
                    } else {
                        break; // End of segment
                    }
                }
                if (lastValidWordInSegment) {
                    foundWordsDetails.push(lastValidWordInSegment);
                }
            }
        }
        return foundWordsDetails;
    }

    function processFoundWordsAndScore(board, foundWordsDetails) {
        console.log("PROCESS_WORDS: Entered processFoundWordsAndScore. Received foundWordsDetails:", JSON.parse(JSON.stringify(foundWordsDetails)));
        let turnScore = 0;
        const coordsToClear = new Set();
        let wordsScoredThisTurn = [];
        if (!foundWordsDetails || foundWordsDetails.length === 0) {
            console.log("PROCESS_WORDS: Exiting early, no words to process.");
            return 0;
        }

        foundWordsDetails.forEach(wordInfo => {
            let scoreForWord = (wordInfo.word.length - 2) * 100;
            if (scoreForWord < 0) scoreForWord = 0;
            turnScore += scoreForWord;
            wordsScoredThisTurn.push(wordInfo.word);
            wordInfo.coords.forEach(coord => coordsToClear.add(JSON.stringify(coord)));
        });

        coordsToClear.forEach(strCoord => {
            const coord = JSON.parse(strCoord);
            board[coord.r][coord.c] = null;
        });

        currentScore += turnScore;
        updateScoreDisplay();

        if (turnScore > 0) { 
            // Add newly scored words to history
            scoredWordsHistory.push(...wordsScoredThisTurn);
            renderScoredWordsList();

            discardCount += DISCARDS_GAINED_PER_WORD_SCORE;
            
            // Award 1 board action per 200 points scored
            const actionsGained = Math.floor(turnScore / 200);
            if (actionsGained > 0) {
                boardActionsCount += actionsGained;
                console.log(`Scored ${turnScore} points! Gained ${DISCARDS_GAINED_PER_WORD_SCORE} discards and ${actionsGained} board actions.`);
                
                // Show a message about gaining board actions
                if (actionsGained === 1) {
                    showMessage(`Scored ${turnScore} points! Gained 1 board action!`);
                } else {
                    showMessage(`Scored ${turnScore} points! Gained ${actionsGained} board actions!`);
                }
            } else {
                console.log(`Scored ${turnScore} points! Gained ${DISCARDS_GAINED_PER_WORD_SCORE} discards.`);
                showMessage(`Scored ${turnScore} points!`);
            }
            
            updateDiscardCountDisplay();
            updateBoardActionsCount();
            
            // Re-enable discard button check if a block happens to be selected
            if(selectedChoiceIndex !== -1) {
                discardButton.disabled = (discardCount <= 0);
            }
        }
        
        return turnScore;
    }

    function replaceChoosableBlock(choiceIndex) {
        if (weightedBlockShapePool.length === 0) {
            initializeWeightedBlockShapes(); // Ensure pool is initialized
        }
        const randomTemplateKey = weightedBlockShapePool[Math.floor(Math.random() * weightedBlockShapePool.length)];
        choosableBlocks[choiceIndex] = generateBlockInstance(randomTemplateKey);
        renderSingleBlockDisplay(choosableBlocks[choiceIndex], choiceBlockElements[choiceIndex]);
        console.log(`Replaced choice block at index ${choiceIndex} with new ${choosableBlocks[choiceIndex]?.name || 'Unknown'}`);
    }
    
    // --- Game Over Logic for New Design ---
    function checkMainBoardGameOver() {
        for (const block of choosableBlocks) {
            if (!block) continue; // Should not happen if populated correctly

            let tempBlock = JSON.parse(JSON.stringify(block)); // Deep copy for rotation tests
            for (let rotation = 0; rotation < 4; rotation++) {
                for (let r = 0; r < MAIN_BOARD_HEIGHT; r++) {
                    for (let c = 0; c < MAIN_BOARD_WIDTH; c++) {
                        if (canPlaceBlockOnMainBoard(mainBoardData, tempBlock, r, c)) {
                            return false; // At least one choosable block can be placed
                        }
                    }
                }
                rotateBlockClockwise(tempBlock); // Rotate the copy
            }
        }
        return true; // No choosable block can be placed in any rotation
    }
    
    function handleTurnEnd() {
        if (checkMainBoardGameOver()) {
            isGameOver = true;
            if (currentScore > highScore) {
                highScore = currentScore;
                saveHighScore();
                showMessage(`GAME OVER! New High Score: ${highScore}!`, true);
            } else {
                showMessage(`GAME OVER! Final Score: ${currentScore}. High Score: ${highScore}`, true);
            }
            disableGameControlsForGameOver();
        } else {
        }
    }

    // --- Drag Handling Helpers ---
    function clearPlacementPreview() {
        currentPreviewCells.forEach(({r, c}) => {
            const cellElement = mainBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cellElement) {
                cellElement.classList.remove('placement-preview-valid', 'placement-preview-invalid');
                const previewText = cellElement.querySelector('.preview-text');
                if (previewText) cellElement.removeChild(previewText);
                if (cellElement.dataset.originalText) {
                    cellElement.textContent = cellElement.dataset.originalText;
                    delete cellElement.dataset.originalText;
                }
            }
        });
        currentPreviewCells = [];
    }

    function handleDragOverBoardCell(event) {
        event.preventDefault(); 
        if (!event.target.closest('.grid-cell')) return; // Added safety check
        const targetCell = event.target.closest('.grid-cell');
        const targetRow = parseInt(targetCell.dataset.row, 10);
        const targetCol = parseInt(targetCell.dataset.col, 10);
        if (currentlyDraggedChoiceIndex === -1) return; 
        const draggedBlock = choosableBlocks[currentlyDraggedChoiceIndex];
        if (!draggedBlock) return;
        
        clearPlacementPreview(); 

        const placementCells = [];
        const blockLetters = draggedBlock.letters;
        for (let r_block = 0; r_block < blockLetters.length; r_block++) {
            for (let c_block = 0; c_block < blockLetters[r_block].length; c_block++) {
                if (blockLetters[r_block][c_block]) { 
                    const boardR = targetRow + r_block;
                    const boardC = targetCol + c_block;
                    placementCells.push({
                        r: boardR, 
                        c: boardC, 
                        letter: blockLetters[r_block][c_block]
                    });
                }
            }
        }

        const isValidPlacement = canPlaceBlockOnMainBoard(mainBoardData, draggedBlock, targetRow, targetCol);
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = isValidPlacement ? "copy" : "none";
        }

        const previewClass = isValidPlacement ? 'placement-preview-valid' : 'placement-preview-invalid';
        placementCells.forEach(({r, c, letter}) => {
            if (r >= 0 && r < MAIN_BOARD_HEIGHT && c >= 0 && c < MAIN_BOARD_WIDTH) {
                const cellElement = mainBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                if (cellElement) {
                    cellElement.classList.add(previewClass);
                    
                    if (!cellElement.dataset.originalText && cellElement.textContent) {
                        cellElement.dataset.originalText = cellElement.textContent;
                    }
                    if (!mainBoardData[r][c]) {
                        // Only add preview text if we are NOT using an active custom ghost
                        // (because the ghost itself shows the letters)
                        if (!activeCustomGhost) {
                            const previewText = document.createElement('span');
                            previewText.textContent = letter;
                            previewText.classList.add('preview-text');
                            previewText.style.opacity = '1'; // Make preview fully opaque
                            previewText.style.fontWeight = 'bold';
                            previewText.style.pointerEvents = 'none';
                            const existingPreview = cellElement.querySelector('.preview-text');
                            if (existingPreview) cellElement.removeChild(existingPreview);
                            cellElement.appendChild(previewText);
                        }
                    }
                    currentPreviewCells.push({r, c});
                }
            }
        });
    }

    function handleDragLeaveBoardCell(event) {
        event.preventDefault(); 
        const relatedTarget = event.relatedTarget;
        if (!mainBoardElement.contains(relatedTarget)) {
             clearPlacementPreview(); 
        }
    }
    
    // Need a global variable to store index during drag (workaround for dataTransfer limitation)
    let currentlyDraggedChoiceIndex = -1;

    // --- Start ---
    startGame();

    // Function to handle cell clicks for row clearing
    function handleCellClick(event) {
        if (isGameOver) return;
        
        const clickedCell = event.target.closest('.grid-cell');
        if (!clickedCell) return;
        
        const rowIndex = parseInt(clickedCell.dataset.row, 10);
        const colIndex = parseInt(clickedCell.dataset.col, 10);
        
        // Only process actions if an action mode is active
        if (!clearRowModeActive && !clearColumnModeActive && !swapModeActive) {
            return; // No action mode active, do nothing
        }
        
        // Handle swap mode
        if (swapModeActive) {
            // We need to have a letter in the cell to swap
            if (mainBoardData[rowIndex][colIndex] === null) {
                return;
            }
            
            // If this is the first cell selected
            if (firstSwapCell === null) {
                firstSwapCell = clickedCell;
                firstSwapPosition = { row: rowIndex, col: colIndex };
                firstSwapCell.classList.add('swap-first-selected');
                return;
            }
            
            // If it's the same cell, deselect it
            if (firstSwapPosition.row === rowIndex && firstSwapPosition.col === colIndex) {
                firstSwapCell.classList.remove('swap-first-selected');
                firstSwapCell = null;
                firstSwapPosition = null;
                return;
            }
            
            // This is the second cell, make sure it has a letter
            if (mainBoardData[rowIndex][colIndex] === null) {
                return;
            }
            
            // We have two valid cells with letters, perform the swap
            const secondCell = clickedCell;
            
            // Add animation to both cells
            firstSwapCell.classList.add('letter-swapping');
            secondCell.classList.add('letter-swapping');
            
            // Decrease board actions count
            boardActionsCount--;
            updateBoardActionsCount();
            
            // Delay the actual swap to allow the animation to play
            setTimeout(() => {
                // Perform the swap
                swapLetters(firstSwapPosition.row, firstSwapPosition.col, rowIndex, colIndex);
                console.log("SWAP_ACTION: Letters swapped in mainBoardData.", JSON.parse(JSON.stringify(mainBoardData)));

                // Clean up
                firstSwapCell.classList.remove('swap-first-selected');
                firstSwapCell.classList.remove('letter-swapping');
                secondCell.classList.remove('letter-swapping');
                
                // Reset the swap variables
                firstSwapCell = null;
                firstSwapPosition = null;
                
                // Update the board
                renderMainBoard();
                console.log("SWAP_ACTION: Board re-rendered after swap.");
                
                // Deactivate swap mode
                deactivateSwapMode();
                
                // Check if the swap formed any words
                console.log("SWAP_ACTION: PRE-TRIGGER - About to attempt calling findWordsOnMainBoard.");
                let wordsFound = []; // Initialize to empty array
                try {
                    wordsFound = findWordsOnMainBoard(mainBoardData);
                    console.log("SWAP_ACTION: POST-TRIGGER - findWordsOnMainBoard was called and executed. Result length:", wordsFound ? wordsFound.length : 'null/undefined');
                } catch (e) {
                    console.error("SWAP_ACTION: ERROR during findWordsOnMainBoard call or its execution:", e);
                    wordsFound = []; // Ensure wordsFound is an array to prevent further errors in subsequent logic
                }

                if (wordsFound && wordsFound.length > 0) {
                    console.log("SWAP_ACTION: Words found, about to call processFoundWordsAndScore. Found details:", JSON.parse(JSON.stringify(wordsFound)));
                    const turnScore = processFoundWordsAndScore(mainBoardData, wordsFound);
                    console.log("SWAP_ACTION: processFoundWordsAndScore returned score:", turnScore);
                    renderMainBoard(); // Re-render after clearing words
                } else {
                    console.log("SWAP_ACTION: No words found after swap (wordsFound is empty or null).");
                }
                
                // Check if the game is over after swapping
                if (checkMainBoardGameOver()) {
                    handleTurnEnd();
                }
            }, 500);
            
            return;
        }
        
        // Handle row clearing
        if (clearRowModeActive) {
            // Check if we have actions left
            if (boardActionsCount <= 0) {
                deactivateClearModes();
                deactivateSwapMode();
                return;
            }
            
            // Check if there are any letters in this row to clear
            const hasLettersInRow = mainBoardData[rowIndex].some(cell => cell !== null);
            
            if (!hasLettersInRow) {
                return;
            }
            
            // Apply animation to cells in the row
            const rowCells = Array.from(mainBoardElement.querySelectorAll(`.grid-cell[data-row="${rowIndex}"]`));
            
            rowCells.forEach(cell => {
                cell.classList.add('row-clearing');
            });
            
            // Delay the actual clearing to allow the animation to play
            setTimeout(() => {
                // Clear the row
                clearRow(rowIndex);
                
                // Decrease actions count
                boardActionsCount--;
                updateBoardActionsCount();
                
                // Update the board display
                renderMainBoard();
                
                // Deactivate clear modes
                deactivateClearModes();
                
                // Check if the game is over after clearing
                if (checkMainBoardGameOver()) {
                    handleTurnEnd();
                }
            }, 500); // Match this to the animation duration
        }
        // Handle column clearing
        else if (clearColumnModeActive) {
            // Check if we have actions left
            if (boardActionsCount <= 0) {
                deactivateClearModes();
                deactivateSwapMode();
                return;
            }
            
            // Check if there are any letters in this column to clear
            let hasLettersInColumn = false;
            for (let r = 0; r < MAIN_BOARD_HEIGHT; r++) {
                if (mainBoardData[r][colIndex] !== null) {
                    hasLettersInColumn = true;
                    break;
                }
            }
            
            if (!hasLettersInColumn) {
                return;
            }
            
            // Apply animation to cells in the column
            const columnCells = Array.from(mainBoardElement.querySelectorAll(`.grid-cell[data-col="${colIndex}"]`));
            
            columnCells.forEach(cell => {
                cell.classList.add('column-clearing'); // Use column-specific animation
            });
            
            // Delay the actual clearing to allow the animation to play
            setTimeout(() => {
                // Clear the column
                clearColumn(colIndex);
                
                // Decrease actions count
                boardActionsCount--;
                updateBoardActionsCount();
                
                // Update the board display
                renderMainBoard();
                
                // Deactivate clear modes
                deactivateClearModes();
                
                // Check if the game is over after clearing
                if (checkMainBoardGameOver()) {
                    handleTurnEnd();
                }
            }, 500); // Match this to the animation duration
        }
    }

    // Function to clear a column in the main board
    function clearColumn(colIndex) {
        if (colIndex < 0 || colIndex >= MAIN_BOARD_WIDTH) return;
        
        // Count how many letters were cleared for better feedback
        let letterCount = 0;
        
        // Clear all cells in the specified column
        for (let r = 0; r < MAIN_BOARD_HEIGHT; r++) {
            if (mainBoardData[r][colIndex] !== null) {
                letterCount++;
                mainBoardData[r][colIndex] = null;
            }
        }
    }

    // Function to update the board actions count display
    function updateBoardActionsCount() {
        boardActionsCountElement.textContent = boardActionsCount;
    }

    // Function to deactivate both clear modes
    function deactivateClearModes() {
        clearRowModeActive = false;
        clearColumnModeActive = false;
        mainBoardElement.classList.remove('block-selected');
        mainBoardElement.classList.remove('column-mode-active');
        clearRowButton.textContent = "Clear Row (Q)";
        clearRowButton.classList.remove('active');
        clearColumnButton.textContent = "Clear Column (W)";
        clearColumnButton.classList.remove('active');
        
        // Re-enable other controls
        if (!isGameOver) {
            choiceBlockElements.forEach(el => {
                el.style.pointerEvents = 'auto';
                el.draggable = true;
            });
        }
    }

    // Function to activate row clear mode
    function activateRowClearMode() {
        // First deactivate any active modes
        deactivateClearModes();
        deactivateSwapMode();
        
        clearRowModeActive = true;
        mainBoardElement.classList.add('block-selected');
        clearRowButton.textContent = "Cancel (Q)";
        clearRowButton.classList.add('active');
        
        // Disable rotation and discard buttons only
        newRotateButton.disabled = true;
        discardButton.disabled = true;
    }

    // Function to activate column clear mode
    function activateColumnClearMode() {
        // First deactivate any active modes
        deactivateClearModes();
        deactivateSwapMode();
        
        clearColumnModeActive = true;
        mainBoardElement.classList.add('column-mode-active');
        clearColumnButton.textContent = "Cancel (W)";
        clearColumnButton.classList.add('active');
        
        // Disable rotation and discard buttons only
        newRotateButton.disabled = true;
        discardButton.disabled = true;
    }

    // Function to clear an entire row in the main board
    function clearRow(rowIndex) {
        if (rowIndex < 0 || rowIndex >= MAIN_BOARD_HEIGHT) return;
        
        // Count how many letters were cleared for better feedback
        let letterCount = 0;
        
        // Clear all cells in the specified row
        for (let c = 0; c < MAIN_BOARD_WIDTH; c++) {
            if (mainBoardData[rowIndex][c] !== null) {
                letterCount++;
                mainBoardData[rowIndex][c] = null;
            }
        }
    }

    // Function to swap two letters on the board
    function swapLetters(row1, col1, row2, col2) {
        // Swap the letters in the mainBoardData
        const temp = mainBoardData[row1][col1];
        mainBoardData[row1][col1] = mainBoardData[row2][col2];
        mainBoardData[row2][col2] = temp;
    }

    // Function to activate swap mode
    function activateSwapMode() {
        // First deactivate any other active modes
        deactivateClearModes();
        deactivateSwapMode();
        
        // If no actions left, return
        if (boardActionsCount <= 0) {
            return;
        }
        
        swapModeActive = true;
        firstSwapCell = null;
        firstSwapPosition = null;
        
        mainBoardElement.classList.add('swap-mode-active');
        swapLettersButton.textContent = "Cancel (E)";
        swapLettersButton.classList.add('active');
        
        // Disable rotation and discard buttons only
        newRotateButton.disabled = true;
        discardButton.disabled = true;
    }

    // Function to deactivate swap mode
    function deactivateSwapMode() {
        swapModeActive = false;
        
        // Clear any selected cells
        if (firstSwapCell) {
            firstSwapCell.classList.remove('swap-first-selected');
            firstSwapCell = null;
        }
        firstSwapPosition = null;
        
        mainBoardElement.classList.remove('swap-mode-active');
        swapLettersButton.textContent = "Swap Letters (E)";
        swapLettersButton.classList.remove('active');
        
        // Re-enable other controls if not game over
        if (!isGameOver) {
            choiceBlockElements.forEach(el => {
                el.style.pointerEvents = 'auto';
                el.draggable = true;
            });
        }
    }

    // Restore showMessage function
    function showMessage(message, isError = false) {
        // Check if gameMessageElement exists before trying to use it
        if (gameMessageElement) { 
            gameMessageElement.textContent = message;
            gameMessageElement.className = isError ? 'error-message' : 'info-message';
            if (message.toLowerCase().includes("game over")) {
                gameMessageElement.classList.add('game-over-message');
            }
        } else {
            console.warn("showMessage called, but gameMessageElement is null. Message:", message);
        }
        // Also keep console logging
        if (isError) {
            console.error("UI_MSG (Error):", message);
        } else {
            console.log("UI_MSG (Info):", message);
        }
    }
}); // End of the main DOMContentLoaded listener