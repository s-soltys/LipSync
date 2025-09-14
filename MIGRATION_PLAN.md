# LipSync Migration Specification

## What We're Building

A TypeScript-based real-time facial animation system that processes audio input to generate synchronized 3D avatar lip movements using neural networks and linear prediction coding.

## Why This Matters

The existing ActionScript/Flash implementation is deprecated and cannot run on modern platforms. We need to preserve the core facial animation technology while making it accessible through modern web browsers and Node.js environments.

## Core User Scenarios

1. **Audio-to-Animation Pipeline**: User provides audio file → system extracts features → neural network classifies visemes → avatar animates in real-time
2. **Neural Network Training**: User provides labeled audio samples → system trains custom networks → exports trained models
3. **Real-time Animation**: User speaks into microphone → system processes audio stream → avatar lip-syncs in real-time
4. **Avatar Customization**: User loads 3D models → system maps facial bones → animations work with custom avatars

## Functional Requirements

### FR1: Audio Feature Extraction
- **Input**: Raw audio data (PCM samples, 44.1kHz)
- **Process**: Apply Linear Prediction Coding (LPC) analysis with order-9 coefficients
- **Output**: Feature vectors representing spectral characteristics
- **Constraints**: Process in 30ms windows with configurable overlap

### FR2: Neural Network Classification  
- **Input**: LPC feature vectors
- **Process**: Multi-layer perceptron with configurable architecture (default: 2 hidden layers, 50 neurons each)
- **Output**: Viseme probabilities (9 viseme classes)
- **Constraints**: Support training from labeled samples, network serialization/deserialization

### FR3: 3D Avatar Animation
- **Input**: Viseme classifications with confidence values
- **Process**: Map visemes to facial bone transformations
- **Output**: Real-time 3D avatar facial animation
- **Constraints**: Support eye blinking, head movement, smooth transitions between visemes

### FR4: Training Pipeline
- **Input**: Audio samples with viseme labels
- **Process**: Extract features, train neural network with backpropagation
- **Output**: Trained network ready for real-time use
- **Constraints**: Support iterative training, progress monitoring, MSE targeting

### FR5: Model Import/Export
- **Input**: 3D avatar models in common formats
- **Process**: Parse geometry, identify facial bones, map to animation rig
- **Output**: Avatar ready for lip-sync animation
- **Constraints**: Support multiple model formats, maintain bone hierarchy

## Migration Approach

### Critical Success Factors
1. **Algorithmic Fidelity**: Neural network must produce identical results to ActionScript version
2. **Performance Preservation**: Real-time audio processing cannot introduce significant latency  
3. **Cross-Platform Compatibility**: Must work in browsers and Node.js environments
4. **Incremental Migration**: Each component should be independently testable and usable

### Implementation Priorities

#### Priority 1: Visual Validation (IMMEDIATE)
**3D Avatar Animation** - Get avatar rendering and basic animation working first
- Set up 3D framework with basic avatar display
- Implement manual viseme triggering for visual validation
- Create simple web interface to test facial animations
- **Goal**: See animated avatar within first implementation session

#### Priority 2: Audio-to-Viseme Pipeline  
**Audio Processing Pipeline** - Connect audio input to visual output
- Port Linear Prediction Coding for feature extraction
- Implement basic viseme classification (can use simplified rules initially)
- Connect audio processing directly to avatar animation
- **Goal**: Audio-driven animation working before neural network complexity

#### Priority 3: Neural Network Enhancement
**Neural Network System** - Add sophisticated classification after visuals work
- Migrate existing trained network for accurate viseme classification
- Replace simplified rules with full neural network processing
- Maintain compatibility with existing trained models
- **Goal**: Production-quality classification with existing training data

### Key Technical Decisions Required

#### Decision 1: 3D Framework Selection
**Options**: Babylon.js (comprehensive), Three.js (lightweight), A-Frame (declarative)
**Evaluation Criteria**: TypeScript support, animation capabilities, model format support, performance
**Resolution Method**: Prototype basic avatar animation with each framework

#### Decision 2: Audio Processing Architecture
**Options**: Web Audio API only, Node.js hybrid, WebAssembly acceleration
**Evaluation Criteria**: Latency, cross-platform compatibility, development complexity
**Resolution Method**: Benchmark LPC processing performance across approaches

#### Decision 3: Model Format Strategy
**Current State**: Collada (.dae) files with embedded textures
**Options**: Convert to GLTF, maintain DAE support, support multiple formats
**Resolution Method**: Analyze existing model files and test conversion pipelines

## Executable Tasks

### Task Group 1: Visual Validation (EXECUTE FIRST)
```typescript
// Target: Immediate visual feedback - see avatar animating ASAP

TASK: Set up basic 3D scene
- Choose framework (recommend Babylon.js for TypeScript support)
- Create minimal HTML page with 3D canvas
- Set up camera, lighting, and basic scene
- Load a simple test model (cube or sphere initially)
- Validate: 3D scene renders in browser

TASK: Create manual viseme controls
- Add UI buttons for each viseme (v1-v6 from Phoneme.as:10-21)
- Implement basic facial bone transformations for mouth shapes
- Create simple morph targets or bone rotations for each viseme
- Connect buttons to avatar facial changes
- Validate: Clicking buttons visibly changes avatar mouth/face

TASK: Implement avatar display
- Research existing 3D model formats in codebase
- Create fallback avatar if original models not accessible
- Implement basic facial rig with jaw, lips, eyebrow controls
- Test smooth transitions between viseme states
- Validate: Avatar responds immediately to manual input
```

### Task Group 2: Audio-to-Visual Bridge (EXECUTE SECOND)  
```typescript
// Target: Connect audio input directly to avatar animation

TASK: Implement basic audio processing
- Set up Web Audio API for microphone input
- Create simple audio analysis (volume/frequency detection initially)
- Implement basic viseme mapping based on audio characteristics
- Use simplified rules before full LPC implementation
- Validate: Speaking into microphone triggers avatar mouth movement

TASK: Create audio file processing
- Support loading MP3/WAV files from lib/female/ and lib/male/
- Implement basic feature extraction (can be simplified initially)
- Map audio features to viseme sequences over time
- Display viseme sequence as avatar animation
- Validate: Audio files drive avatar lip sync animation

TASK: Add real-time audio visualization
- Create simple audio waveform or spectrum display
- Show current detected viseme/phoneme in UI
- Add playback controls for audio files
- Connect audio playback timeline to avatar animation
- Validate: User can see audio analysis driving avatar in real-time
```

### Task Group 3: Neural Network Migration (EXECUTE THIRD)
```typescript
// Target: Accurate viseme classification after visuals confirmed working

TASK: Migrate NeuralNetwork class
- Port backpropagation algorithm from NeuralNetwork.as:216
- Maintain floating-point precision for identical results
- Create test suite validating against ActionScript reference
- Validate: Network produces identical outputs for test inputs

TASK: Integrate trained network
- Implement network serialization compatible with existing models
- Load existing trained networks from ActionScript system
- Replace simplified audio-to-viseme rules with neural network classification
- Validate: Trained network improves lip sync accuracy significantly

TASK: Implement Linear Prediction Coding
- Port LP.analyze() function maintaining coefficient accuracy  
- Implement full audio feature extraction pipeline
- Connect LPC features to neural network input
- Validate: Full pipeline matches ActionScript system output
```

### Task Group 4: Advanced Features (EXECUTE LAST)
```typescript
// Target: Polish and production features after core functionality works

TASK: Enhance avatar realism
- Implement eye blinking system from AvatarCore.as:100-103
- Add lookAt() functionality for eye and head tracking
- Create smooth expression transitions and blending
- Support emotion overlays on top of viseme animations
- Validate: Avatar appears more lifelike and responsive

TASK: Add training interface
- Create web-based neural network training UI
- Support loading training audio samples
- Implement training progress visualization
- Add network export/import functionality
- Validate: Users can train custom networks through web interface

TASK: Optimize performance
- Profile audio processing and rendering performance
- Implement WebWorkers for audio analysis if needed
- Optimize 3D rendering for smooth real-time animation
- Add quality/performance settings for different devices
- Validate: System runs smoothly on target hardware configurations
```

## Acceptance Criteria

### Visual Validation (Immediate Goals)
- **Task Group 1 Complete**: Avatar visible and animating in browser within first session
- **Manual Control**: User can click buttons to change avatar facial expressions
- **Smooth Animation**: Transitions between viseme states are visually smooth
- **Responsive UI**: No lag between user input and avatar response

### Audio-Visual Integration (Short-term Goals)  
- **Task Group 2 Complete**: Audio input drives avatar animation in real-time
- **File Playback**: MP3 files from lib/ directory animate avatar correctly
- **Microphone Input**: Speaking into mic triggers appropriate mouth movements
- **Visual Feedback**: User can see audio analysis and resulting viseme detection

### System-Level Validation (Final Goals)
- **Neural Network Integration**: Trained networks produce accurate lip sync
- **Performance**: Real-time processing with <50ms audio latency
- **Compatibility**: System works with existing audio samples and trained models

### Success Milestones
1. **Hour 1**: 3D avatar rendering in browser
2. **Hour 2**: Manual viseme controls working  
3. **Day 1**: Audio files driving avatar animation
4. **Week 1**: Real-time microphone lip sync
5. **Week 2**: Neural network integration complete

---

*This specification defines the exact requirements for AI-driven migration. Each task is independently executable with clear validation criteria.*