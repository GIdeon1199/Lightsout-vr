console.log("GAME.JS VR LOADED");

const GameState = {
    currentSceneId: null,
    foundFragments: {},
    branchChoice: null,
    lastTouch: null
};

// --- AUDIO MANAGER ---
const AudioManager = {
    ambient: new Audio("ambient_horror.mp3"),
    typing: new Audio("typing.mp3"),
    click: new Audio("clickmp3.mp3"),
    init: function () {
        this.ambient.loop = true;
        this.ambient.volume = 0.3;
        // Make typing sound loop cleanly
        this.typing.loop = true;
        
        // A-Frame checks
        if(!AFRAME) console.error("A-FRAME IS NOT LOADED!");
    },
    playAmbient: function () {
        this.ambient.play().catch(e => console.log("Audio play blocked", e));
    },
    playTyping: function () {
        if (this.typing.paused) this.typing.play().catch(() => { });
    },
    stopTyping: function () {
        this.typing.pause();
        this.typing.currentTime = 0;
    },
    playClick: function () {
        this.click.currentTime = 0;
        this.click.play().catch(() => { });
    }
};
AudioManager.init();

window.addEventListener('load', () => {
    // Button Listeners for 2D UI
    document.getElementById("venture-btn").addEventListener("click", onVentureClicked);
    const hudCodeBtn = document.getElementById("hud-enter-code");
    const openCodeEntry = () => {
        if (!hudCodeBtn.classList.contains('hidden-aframe')) {
            openCodeModalVR();
        }
    };
    hudCodeBtn.addEventListener("mousedown", openCodeEntry);
    hudCodeBtn.addEventListener("click", openCodeEntry);
    
    // START SEQUENCE
    runOpeningSequence();
});

function runOpeningSequence() {
    const intro = document.getElementById("intro-dialogue");
    const title = document.getElementById("title-screen");
    setTimeout(() => {
        intro.classList.add("hidden");
        title.classList.remove("hidden");
    }, 5000);
}

function onVentureClicked() {
    document.getElementById("title-screen").classList.add("hidden");
    document.getElementById("game-container").classList.remove("hidden");
    
    AudioManager.playAmbient();

    const sceneEl = document.querySelector('a-scene');

    // Attempt to enter VR automatically
    if (sceneEl.hasLoaded) {
        sceneEl.enterVR();
    } else {
        sceneEl.addEventListener('loaded', () => sceneEl.enterVR());
    }
    
    // Skip saving logic, directly load the first room
    loadScene("wheatley_classroom", true);
}

// --- MATH UTILS ---
// Convert pitch (up/down) and yaw (left/right) to Cartesian coordinates
function getXYZ(pitch, yaw, radius) {
    const pitchRad = pitch * (Math.PI / 180);
    const yawRad = yaw * (Math.PI / 180);
    
    // Y is up/down based on pitch
    const y = radius * Math.sin(pitchRad);
    
    // The horizontal radius
    const xzRadius = radius * Math.cos(pitchRad);
    
    // In Pannellum, yaw increases to the right. 
    // In A-Frame, negative Z is forward, positive X is right.
    const x = xzRadius * Math.sin(yawRad);
    const z = -xzRadius * Math.cos(yawRad);
    
    return {x, y, z};
}


// --- CORE GAME LOGIC ---

function loadScene(sceneId, skipTransition = false) {
    console.log(`Loading VR scene: ${sceneId}`);
    localStorage.setItem("lightsOut_savedScene", sceneId);
    GameState.currentSceneId = sceneId;
    const sceneData = SCENES[sceneId];

    const overlay = document.getElementById("transition-overlay");
    if (skipTransition) {
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        if (!GameState.foundFragments[sceneId]) {
            GameState.foundFragments[sceneId] = new Set();
        }
        updateFragmentCounter();
        refreshVRScene(sceneData);

        // Show onboarding on first level
        setTimeout(() => {
            showHUDOnboarding([
                sceneData.name,
                sceneData.description,
                "Use your FLASHLIGHT to explore the darkness.",
                "Find HIDDEN FRAGMENTS to unlock the exit code."
            ]);
        }, 2000);
        return;
    }

    // --- TRANSITION SCENE ---
    overlay.style.display = "flex";
    overlay.classList.remove("hidden");
    overlay.style.opacity = "1";

    document.getElementById("transition-title").innerHTML = "";
    document.getElementById("transition-text").innerHTML = "";

    typeWriter(sceneData.name, "transition-title", 100, () => {
        typeWriter(sceneData.description, "transition-text", 50, () => {
            setTimeout(() => {
                overlay.style.transition = "opacity 1s ease";
                overlay.style.opacity = "0";
                setTimeout(() => {
                    overlay.classList.add("hidden");
                    overlay.style.display = "none";
                }, 1000);
            }, 2000);
        });
    });

    if (!GameState.foundFragments[sceneId]) {
        GameState.foundFragments[sceneId] = new Set();
    }
    
    updateFragmentCounter();
    refreshVRScene(sceneData);
}

function refreshVRScene(sceneData) {
    const assetsEl = document.getElementById('scene-assets');
    const skyEl = document.getElementById('environment-sky');
    const worldEl = document.getElementById('world-objects');
    
    // Clear old objects
    worldEl.innerHTML = '';
    
    // Setup Environment Sky - for our custom sphere, set via material.src
    skyEl.setAttribute('material', 'src', sceneData.image);
    
    // Spawn Hotspots at radius 12 (inside the environment sphere at radius 15)
    sceneData.hotspots.forEach(hs => {
        const isFound = GameState.foundFragments[GameState.currentSceneId].has(hs.fragmentId);
        
        if (!isFound) {
            const fragment = sceneData.fragments.find(f => f.id === hs.fragmentId);
            const pos = getXYZ(hs.pitch, hs.yaw, 12); // Radius 12, inside the 15-radius sky sphere
            
            const hotspotEl = document.createElement('a-entity');
            hotspotEl.setAttribute('geometry', 'primitive: plane; width: 1.2; height: 1.2');
            // shader: standard makes them invisible in darkness, only revealed by flashlight
            hotspotEl.setAttribute('material', {
                src: `no${fragment.value}.png`,
                transparent: true,
                shader: 'standard',
                metalness: 0,
                roughness: 1,
                emissive: '#000',
                emissiveIntensity: 0
            });
            hotspotEl.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
            hotspotEl.setAttribute('look-at', '0 0 0');
            hotspotEl.setAttribute('class', 'clickable fragment-entity');
            
            // Hover effects
            hotspotEl.addEventListener('mouseenter', () => {
                hotspotEl.setAttribute('scale', '1.2 1.2 1.2');
            });
            hotspotEl.addEventListener('mouseleave', () => {
                hotspotEl.setAttribute('scale', '1 1 1');
            });
            
            // Mousedown
            hotspotEl.addEventListener('mousedown', (evt) => {
                onFragmentFound(hs.fragmentId, fragment.value, evt.target);
            });
            
            worldEl.appendChild(hotspotEl);
        }
    });

    // Reset code hud
    const hudCodeBtn = document.getElementById('hud-enter-code');
    const hudCodeLabel = document.getElementById('hud-enter-code-label');
    hudCodeBtn.classList.add('hidden-aframe');
    hudCodeBtn.setAttribute('visible', 'false');
    hudCodeBtn.setAttribute('material', 'color', '#111');
    hudCodeLabel.setAttribute('text', 'value', 'ENTER CODE');
}

function onFragmentFound(fragmentId, fragmentValue, element) {
    AudioManager.playClick();
    GameState.foundFragments[GameState.currentSceneId].add(fragmentId);
    
    // Remove entity
    if(element.parentNode) {
        element.parentNode.removeChild(element);
    }
    
    updateFragmentCounter();
    showIntelModalVR(`FRAGMENT ${fragmentValue} ACQUIRED`, fragmentValue);
    
    checkAllFragmentsFound();
}

function updateFragmentCounter() {
    const sceneId = GameState.currentSceneId;
    if (!SCENES[sceneId]) return;
    const found = GameState.foundFragments[sceneId].size;
    const total = SCENES[sceneId].totalFragments;
    
    const hud = document.getElementById("hud-fragments");
    hud.setAttribute('text', `value: ${found}/${total} Fragments`);
}

function checkAllFragmentsFound() {
    const sceneId = GameState.currentSceneId;
    const found = GameState.foundFragments[sceneId].size;
    const total = SCENES[sceneId].totalFragments;

    if (found >= total) {
        const hudCodeBtn = document.getElementById("hud-enter-code");
        const hudCodeLabel = document.getElementById("hud-enter-code-label");
        hudCodeBtn.classList.remove('hidden-aframe');
        hudCodeBtn.setAttribute('visible', 'true');
        hudCodeBtn.setAttribute('material', 'color', '#132813');
        hudCodeLabel.setAttribute('text', 'value', 'ENTER CODE');
    }
}

function typeWriter(text, elementId, speed, callback) {
    const elem = document.getElementById(elementId);
    elem.innerHTML = "";
    let i = 0;
    AudioManager.playTyping();
    function type() {
        if (i < text.length) {
            elem.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        } else if (callback) {
            AudioManager.stopTyping();
            callback();
        }
    }
    type();
}


// --- 3D VR MODALS ---

function destroyActiveModalVR() {
    const existing = document.getElementById('active-vr-modal');
    if(existing) existing.parentNode.removeChild(existing);
}

function spawnInFrontOfCamera(modalEl, targetDistance) {
    const rig3D = document.getElementById('rig').object3D;
    rig3D.updateMatrixWorld(true);

    const cam3D = document.getElementById('camera').object3D;
    
    // Explicitly update matrices twice for tight VR initialization loops
    document.getElementById('rig').object3D.updateMatrixWorld(true);
    cam3D.updateMatrixWorld(true);
    
    const worldPos = new THREE.Vector3();
    const worldDir = new THREE.Vector3();
    cam3D.getWorldPosition(worldPos);
    cam3D.getWorldDirection(worldDir);
    
    const spawnPos = worldPos.clone().add(worldDir.multiplyScalar(targetDistance));
    
    modalEl.setAttribute('position', `${spawnPos.x} ${spawnPos.y} ${spawnPos.z}`);
    
    // Calculate rotation to match camera exactly (faces user)
    const worldQuat = new THREE.Quaternion();
    cam3D.getWorldQuaternion(worldQuat);
    const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
    
    const rX = THREE.MathUtils.radToDeg(euler.x);
    const rY = THREE.MathUtils.radToDeg(euler.y);
    const rZ = THREE.MathUtils.radToDeg(euler.z);
    
    modalEl.setAttribute('rotation', `${rX} ${rY} ${rZ}`);
    
    document.getElementById('vr-scene').appendChild(modalEl);
}

function showIntelModalVR(message, value) {
    destroyActiveModalVR();
    const sceneId = GameState.currentSceneId;
    const sceneData = SCENES[sceneId];
    const allFragmentsFound = GameState.foundFragments[sceneId].size >= sceneData.totalFragments;
    
    // Create UI panel in world
    const modal = document.createElement('a-entity');
    modal.setAttribute('id', 'active-vr-modal');
    
    // Background plane - use flat shader so UI is always visible
    const bg = document.createElement('a-entity');
    bg.setAttribute('geometry', 'primitive: box; width: 2.5; height: 2; depth: 0.1');
    bg.setAttribute('material', 'color: #000; opacity: 0.95; shader: flat');
    bg.setAttribute('position', '0 0 -0.05');
    modal.appendChild(bg);

    // Text Header (Setting via object prevents parsing breaks on newlines and colons)
    const text = document.createElement('a-entity');
    text.setAttribute('text', {value: message, color: '#33ff33', align: 'center', width: 4});
    text.setAttribute('position', '0 0.7 0.05');
    modal.appendChild(text);
    
    // Image explicitly defined - flat shader so it's always visible in the UI
    const img = document.createElement('a-entity');
    img.setAttribute('geometry', 'primitive: plane; width: 0.8; height: 0.8');
    img.setAttribute('material', `src: no${value}.png; transparent: true; shader: flat`);
    img.setAttribute('position', '0 0 0.05');
    modal.appendChild(img);

    // Close Button
    const btn = document.createElement('a-entity');
    btn.setAttribute('geometry', 'primitive: box; width: 1.5; height: 0.3; depth: 0.05');
    btn.setAttribute('material', 'color: #33ff33; shader: flat');
    btn.setAttribute('position', '0 -0.7 0.025');
    btn.setAttribute('class', 'clickable');
    
    const btnText = document.createElement('a-entity');
    btnText.setAttribute('text', {value: allFragmentsFound ? 'ENTER CODE' : 'ACKNOWLEDGE', color: '#000', align: 'center', zOffset: 0.01, width: 4});
    btn.appendChild(btnText);
    
    btn.addEventListener('mousedown', () => {
        AudioManager.playClick();
        destroyActiveModalVR();
        if (allFragmentsFound) {
            setTimeout(() => {
                openCodeModalVR();
            }, 150);
        }
    });
    
    // Hover
    btn.addEventListener('mouseenter', () => btn.setAttribute('scale', '1.05 1.05 1.05'));
    btn.addEventListener('mouseleave', () => btn.setAttribute('scale', '1 1 1'));

    modal.appendChild(btn);
    
    // Parent to WORLD instead of camera
    spawnInFrontOfCamera(modal, 2.0); // Spawn 2 meters in front
}

let currentInput = [];

function shuffleArray(items) {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function openCodeModalVR() {
    destroyActiveModalVR();
    const sceneData = SCENES[GameState.currentSceneId];
    const availableDigits = shuffleArray(sceneData.fragments);
    
    if (!currentInput.length || currentInput.length !== sceneData.finalCode.length) {
        currentInput = new Array(sceneData.finalCode.length).fill("");
    }

    const modal = document.createElement('a-entity');
    modal.setAttribute('id', 'active-vr-modal');
    
    // Background
    const bg = document.createElement('a-entity');
    bg.setAttribute('geometry', 'primitive: box; width: 4.1; height: 3.1; depth: 0.1');
    bg.setAttribute('material', 'color: #000; opacity: 0.95; shader: flat');
    bg.setAttribute('position', '0 0 -0.05');
    modal.appendChild(bg);
    
    // Title
    const title = document.createElement('a-entity');
    title.setAttribute('text', {value: 'SECURITY OVERRIDE', color: '#ff0000', align: 'center', width: 4.2});
    title.setAttribute('position', '0 1.2 0.05');
    modal.appendChild(title);

    // Instruction
    const inst = document.createElement('a-entity');
    inst.setAttribute('text', {value: 'Tap the digits below in the right order', color: '#888', align: 'center', width: 3.1});
    inst.setAttribute('position', '0 0.88 0.05');
    modal.appendChild(inst);

    // Code display (shows _ _ _ as you fill in)
    const codeDisplay = document.createElement('a-entity');
    codeDisplay.setAttribute('id', 'vr-code-display');
    codeDisplay.setAttribute('text', {value: currentInput.map(c => c || "_").join("  "), color: '#33ff33', align: 'center', width: 3.6});
    codeDisplay.setAttribute('position', '0 0.52 0.05');
    modal.appendChild(codeDisplay);
    
    // Feedback message
    const feedbackMsg = document.createElement('a-entity');
    feedbackMsg.setAttribute('id', 'vr-code-feedback');
    feedbackMsg.setAttribute('text', {value: '', color: '#ff3333', align: 'center', width: 3.2});
    feedbackMsg.setAttribute('position', '0 0.15 0.05');
    modal.appendChild(feedbackMsg);

    // Number buttons — show the found digits, but in a shuffled order
    const fragmentsNum = availableDigits.length;
    const spacing = fragmentsNum > 5 ? 0.52 : 0.6;
    const startX = -((fragmentsNum - 1) * spacing) / 2;
    
    availableDigits.forEach((frag, idx) => {
        const x = startX + idx * spacing;
        
        const btn = document.createElement('a-entity');
        btn.setAttribute('geometry', 'primitive: box; width: 0.42; height: 0.42; depth: 0.05');
        btn.setAttribute('material', 'color: #1a1a2e; shader: flat');
        btn.setAttribute('position', `${x} -0.28 0.05`);
        btn.setAttribute('class', 'clickable');
        
        // Large number text on the button
        const numText = document.createElement('a-entity');
        numText.setAttribute('text', {value: String(frag.value), color: '#33ff33', align: 'center', width: 1.6});
        numText.setAttribute('position', '0 0 0.03');
        btn.appendChild(numText);
        
        // Click handler
        const processInput = () => {
            AudioManager.playClick();
            const emptyIndex = currentInput.findIndex(val => val === "");
            if (emptyIndex !== -1) {
                currentInput[emptyIndex] = frag.value;
                document.getElementById('vr-code-display').setAttribute('text', 'value', currentInput.map(c => c || "_").join("  "));
            }
        };
        btn.addEventListener('mousedown', processInput);
        btn.addEventListener('click', processInput);
        
        // Hover
        btn.addEventListener('mouseenter', () => {
            btn.setAttribute('material', 'color: #2a2a4e; shader: flat');
            btn.setAttribute('scale', '1.1 1.1 1.1');
        });
        btn.addEventListener('mouseleave', () => {
            btn.setAttribute('material', 'color: #1a1a2e; shader: flat');
            btn.setAttribute('scale', '1 1 1');
        });
        
        modal.appendChild(btn);
    });
    
    // Action Buttons Row
    const btnY = -0.95;
    
    // Submit
    const submitBtn = document.createElement('a-entity');
    submitBtn.setAttribute('position', `0.6 ${btnY} 0.05`);
    submitBtn.setAttribute('geometry', 'primitive: box; width: 0.9; height: 0.3; depth: 0.05');
    submitBtn.setAttribute('material', 'color: #33ff33; shader: flat');
    submitBtn.setAttribute('class', 'clickable');
    const submitText = document.createElement('a-entity');
    submitText.setAttribute('text', {value: 'EXECUTE', color: '#000', align: 'center', zOffset: 0.01, width: 4});
    submitBtn.appendChild(submitText);
    const trySubmit = () => { submitCodeVR(sceneData); };
    submitBtn.addEventListener('mousedown', trySubmit);
    submitBtn.addEventListener('click', trySubmit);
    modal.appendChild(submitBtn);

    // Clear
    const clearBtn = document.createElement('a-entity');
    clearBtn.setAttribute('position', `-0.6 ${btnY} 0.05`);
    clearBtn.setAttribute('geometry', 'primitive: box; width: 0.9; height: 0.3; depth: 0.05');
    clearBtn.setAttribute('material', 'color: #ff0000; shader: flat');
    clearBtn.setAttribute('class', 'clickable');
    const clearText = document.createElement('a-entity');
    clearText.setAttribute('text', {value: 'CLEAR', color: '#000', align: 'center', zOffset: 0.01, width: 4});
    clearBtn.appendChild(clearText);
    const tryClear = () => {
        AudioManager.playClick();
        currentInput = new Array(sceneData.finalCode.length).fill("");
        document.getElementById('vr-code-display').setAttribute('text', 'value', currentInput.map(c => c || "_").join("  "));
        document.getElementById('vr-code-feedback').setAttribute('text', 'value', '');
    };
    clearBtn.addEventListener('mousedown', tryClear);
    clearBtn.addEventListener('click', tryClear);
    modal.appendChild(clearBtn);

    // Close
    const closeBtn = document.createElement('a-entity');
    closeBtn.setAttribute('position', '1.7 1.35 0.05');
    closeBtn.setAttribute('geometry', 'primitive: box; width: 0.25; height: 0.25; depth: 0.05');
    closeBtn.setAttribute('material', 'color: #333; shader: flat');
    closeBtn.setAttribute('class', 'clickable');
    const closeText = document.createElement('a-entity');
    closeText.setAttribute('text', {value: 'X', color: '#fff', align: 'center', zOffset: 0.01, width: 3});
    closeBtn.appendChild(closeText);
    closeBtn.addEventListener('mousedown', destroyActiveModalVR);
    modal.appendChild(closeBtn);

    // Spawn in front of user
    spawnInFrontOfCamera(modal, 3.6);
}

function submitCodeVR(sceneData) {
    const finalCode = sceneData.finalCode;
    let isComplete = true;
    let isCorrect = true;
    const codeDisplay = document.getElementById('vr-code-display');
    const feedback = document.getElementById('vr-code-feedback');

    const newInput = currentInput.map((char, index) => {
        if (char === "") {
            isComplete = false;
            return "";
        }
        if (char === finalCode[index]) {
            return char; 
        } else {
            isCorrect = false;
            return ""; 
        }
    });

    currentInput = newInput;
    codeDisplay.setAttribute('text', 'value', currentInput.map(c => c || "_").join("  "));

    if (isComplete && isCorrect) {
        feedback.setAttribute('text', 'value', 'ACCESS GRANTED');
        feedback.setAttribute('text', 'color', '#33ff33');
        showLevelCompleteModal(sceneData);
    } else {
        feedback.setAttribute('text', 'value', isComplete ? 'INCORRECT ENTRIES REMOVED' : 'FILL ALL SLOTS');
        feedback.setAttribute('text', 'color', '#ff3333');
    }
}

function handleSceneSuccessVR(sceneData) {
    if (sceneData.nextScene === "BRANCH_DECISION") {
        showBranchModalVR();
    } else if (sceneData.nextScene === null) {
        showEndGame();
    } else {
        transitionToScene(sceneData.nextScene);
    }
}

function showLevelCompleteModal(sceneData) {
    setTimeout(() => {
        destroyActiveModalVR();

        const modal = document.createElement('a-entity');
        modal.setAttribute('id', 'active-vr-modal');

        const bg = document.createElement('a-entity');
        bg.setAttribute('geometry', 'primitive: box; width: 3.2; height: 2.1; depth: 0.1');
        bg.setAttribute('material', 'color: #000; opacity: 0.95; shader: flat');
        bg.setAttribute('position', '0 0 -0.05');
        modal.appendChild(bg);

        const title = document.createElement('a-entity');
        title.setAttribute('text', {value: 'LEVEL COMPLETE', color: '#33ff33', align: 'center', width: 4});
        title.setAttribute('position', '0 0.65 0.05');
        modal.appendChild(title);

        const sceneName = document.createElement('a-entity');
        sceneName.setAttribute('text', {value: `${sceneData.name} cleared`, color: '#cccccc', align: 'center', width: 4});
        sceneName.setAttribute('position', '0 0.25 0.05');
        modal.appendChild(sceneName);

        const nextBtn = document.createElement('a-entity');
        nextBtn.setAttribute('position', '0 -0.45 0.05');
        nextBtn.setAttribute('geometry', 'primitive: box; width: 1.8; height: 0.4; depth: 0.05');
        nextBtn.setAttribute('material', 'color: #33ff33; shader: flat');
        nextBtn.setAttribute('class', 'clickable');

        const nextText = document.createElement('a-entity');
        nextText.setAttribute('text', {value: sceneData.nextScene === null ? 'FINISH' : 'NEXT LEVEL', color: '#000', align: 'center', zOffset: 0.01, width: 4});
        nextBtn.appendChild(nextText);

        nextBtn.addEventListener('mouseenter', () => nextBtn.setAttribute('scale', '1.05 1.05 1.05'));
        nextBtn.addEventListener('mouseleave', () => nextBtn.setAttribute('scale', '1 1 1'));
        nextBtn.addEventListener('mousedown', () => {
            AudioManager.playClick();
            destroyActiveModalVR();
            document.getElementById('hud-enter-code').classList.add('hidden-aframe');
            document.getElementById('hud-enter-code').setAttribute('visible', 'false');
            currentInput = [];
            handleSceneSuccessVR(sceneData);
        });

        modal.appendChild(nextBtn);
        spawnInFrontOfCamera(modal, 2.2);
    }, 600);
}

function showBranchModalVR() {
    destroyActiveModalVR();
    const modal = document.createElement('a-entity');
    modal.setAttribute('id', 'active-vr-modal');
    
    const bg = document.createElement('a-entity');
    bg.setAttribute('geometry', 'primitive: box; width: 3.5; height: 2.5; depth: 0.1');
    bg.setAttribute('material', 'color: #000; opacity: 0.95; shader: flat');
    bg.setAttribute('position', '0 0 -0.05');
    modal.appendChild(bg);
    
    const title = document.createElement('a-entity');
    title.setAttribute('text', {value: 'CHOOSE PATH', color: '#ff0000', align: 'center', width: 4});
    title.setAttribute('position', '0 0.8 0.05');
    modal.appendChild(title);
    
    // Choose Hale
    const haleBtn = document.createElement('a-entity');
    haleBtn.setAttribute('position', '0 0.2 0.05');
    haleBtn.setAttribute('geometry', 'primitive: box; width: 2.8; height: 0.5; depth: 0.05');
    haleBtn.setAttribute('material', 'color: #222; shader: flat');
    haleBtn.setAttribute('class', 'clickable');
    
    const haleText = document.createElement('a-entity');
    haleText.setAttribute('text', {value: 'Hale Cafe\n(Longer route. Potential intel.)', color: '#ff3333', align: 'center', zOffset: 0.01, width: 3});
    haleBtn.appendChild(haleText);
    
    haleBtn.addEventListener('mousedown', () => { handleBranchDecision('hale_cafe'); });
    modal.appendChild(haleBtn);

    // Choose Rotunda
    const rotundaBtn = document.createElement('a-entity');
    rotundaBtn.setAttribute('position', '0 -0.5 0.05');
    rotundaBtn.setAttribute('geometry', 'primitive: box; width: 2.8; height: 0.5; depth: 0.05');
    rotundaBtn.setAttribute('material', 'color: #222; shader: flat');
    rotundaBtn.setAttribute('class', 'clickable');
    
    const rotundaText = document.createElement('a-entity');
    rotundaText.setAttribute('text', {value: 'Direct to Rotunda\n(Faster. Higher risk.)', color: '#ff3333', align: 'center', zOffset: 0.01, width: 3});
    rotundaBtn.appendChild(rotundaText);

    rotundaBtn.addEventListener('mousedown', () => { handleBranchDecision('nicholson_rotunda'); });
    modal.appendChild(rotundaBtn);
    
    spawnInFrontOfCamera(modal, 2.0);
}

function handleBranchDecision(choice) {
    destroyActiveModalVR();
    GameState.branchChoice = choice;
    localStorage.setItem("lightsOut_branchChoice", choice);
    transitionToScene(choice);
}

function transitionToScene(nextSceneId) {
    // We use the 2D overlay transition just outside immersion if we're not fully locked inside,
    // Alternatively we can use a VR fade to black sphere.
    // For now the 2D overlay works on web when transition loads.
    const overlay = document.getElementById("transition-overlay");
    overlay.classList.remove("hidden");
    overlay.style.opacity = "1";

    document.getElementById("transition-title").innerText = "LOADING...";
    document.getElementById("transition-text").innerText = "You come to... but not where you were...";
    document.getElementById("start-btn").style.display = "none";

    setTimeout(() => {
        loadScene(nextSceneId);
    }, 2000);
}

function showEndGame() {
    const overlay = document.getElementById("transition-overlay");
    overlay.classList.remove("hidden");
    overlay.style.opacity = "1";

    document.getElementById("transition-title").innerText = "The lights return... but the truth doesn't.";

    let pathText = "You navigated the blackout successfully.";
    if (GameState.branchChoice === 'hale_cafe') {
        pathText += " You can see again. But you still don't understand what happened.";
    } else {
        pathText += "And somewhere deep in the building... the blackout hums again.";
    }

    document.getElementById("transition-text").innerText = pathText;

    const btn = document.getElementById("start-btn");
    btn.style.display = "block";
    btn.innerText = "PLAY AGAIN";
    btn.classList.remove("hidden");
    btn.onclick = () => {
        localStorage.removeItem("lightsOut_savedScene");
        window.location.reload();
    };
}

// --- HUD ONBOARDING (auto-fading text attached to camera) ---
let onboardingQueue = [];
let onboardingActive = false;

function showHUDOnboarding(messages) {
    onboardingQueue = [...messages];
    if (!onboardingActive) {
        onboardingActive = true;
        showNextOnboardingStep();
    }
}

function showNextOnboardingStep() {
    const hud = document.getElementById('hud-onboarding');
    const hudText = document.getElementById('hud-onboarding-text');
    if (!hud || !hudText || onboardingQueue.length === 0) {
        // Done — hide and reset
        if (hud) {
            hud.setAttribute('visible', 'false');
        }
        onboardingActive = false;
        return;
    }

    const message = onboardingQueue.shift();
    
    // Update the text child, show the container
    hudText.setAttribute('text', 'value', message);
    hud.setAttribute('visible', 'true');

    // Auto-advance after 5.5 seconds
    setTimeout(() => {
        showNextOnboardingStep();
    }, 5500);
}
