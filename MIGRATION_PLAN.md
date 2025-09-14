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

#### Priority 1: Foundation Components
**Neural Network System** - Core mathematical operations with no external dependencies
- Migrate backpropagation algorithm preserving floating-point precision
- Implement network serialization compatible with existing trained models
- Create comprehensive test suite validating against ActionScript reference

**Audio Processing Pipeline** - Linear Prediction Coding and feature extraction
- Port LPC analysis maintaining coefficient accuracy
- Implement windowing and overlap processing
- Support both file-based and real-time audio streams

#### Priority 2: Visual Components  
**3D Avatar Animation** - Facial bone manipulation and rendering
- Research optimal 3D framework (Babylon.js vs Three.js vs alternatives)
- Implement viseme-to-bone mapping system
- Support model loading from common 3D formats

#### Priority 3: Integration Components
**Training Interface** - User-facing tools for network development
- Create web-based UI replacing MXML interface
- Implement training progress visualization
- Support batch processing and model export

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

### Task Group 1: Neural Network Migration
```typescript
// Target: Exact algorithmic replication of ActionScript neural network

TASK: Migrate NeuralNetwork class
- Analyze existing network architecture from NeuralNetwork.as:216
- Port backpropagation algorithm maintaining floating-point precision  
- Implement save/load functionality compatible with existing ByteArray format
- Validate: Network produces identical outputs for identical inputs

TASK: Migrate Neuron class  
- Port activation function and weight adjustment logic from Neuron.as
- Maintain momentum calculation accuracy
- Implement bias handling identical to ActionScript version
- Validate: Individual neuron calculations match reference implementation

TASK: Create network serialization
- Replace ByteArray with Buffer/JSON while maintaining data compatibility
- Support loading existing .network files from ActionScript version
- Implement compression equivalent to ActionScript's ByteArray.compress()
- Validate: Serialized networks load correctly in both systems
```

### Task Group 2: Audio Processing Migration
```typescript
// Target: Preserve LPC analysis accuracy and performance

TASK: Migrate Linear Prediction Coding
- Port LP.analyze() function from LP.as:115-125 maintaining coefficient accuracy
- Implement Hamming window generation from LP.as:17-25
- Port autocorrelation calculation from LP.as:29-68
- Validate: LPC coefficients match ActionScript output within floating-point precision

TASK: Implement audio pipeline
- Create audio buffer management for 30ms windows
- Support both file-based and real-time audio processing
- Implement decimation and windowing as specified in LipsyncSettings
- Validate: Feature extraction produces consistent results across audio sources

TASK: Port phoneme mapping
- Migrate viseme classification from Phoneme.as:8-27
- Maintain exact viseme ID mapping for neural network compatibility
- Implement phoneme collections and lookup functionality
- Validate: Phoneme mappings produce identical viseme classifications
```

### Task Group 3: 3D Framework Evaluation
```typescript
// Target: Select optimal framework through systematic comparison

TASK: Prototype with Babylon.js
- Create basic scene with camera and lighting
- Load sample 3D model (research DAE vs GLTF conversion)
- Implement basic bone manipulation for facial animation
- Measure: Loading performance, animation smoothness, bundle size

TASK: Prototype with Three.js  
- Create equivalent scene setup
- Test model loading capabilities and format support
- Implement basic facial bone controls
- Measure: Performance comparison, development complexity, feature completeness

TASK: Comparative analysis
- Document API differences and TypeScript support quality
- Analyze animation system capabilities for facial expression control
- Evaluate community support and documentation quality
- Decision: Select framework based on objective criteria matrix
```

### Task Group 4: Avatar Animation System
```typescript
// Target: Replicate AvatarCore.as functionality in chosen 3D framework

TASK: Migrate AvatarCore
- Port avatar initialization and management from AvatarCore.as:34-51
- Implement setViseme() function maintaining expression blending logic
- Create eye blinking system replicating timer-based behavior
- Validate: Avatar responds to viseme commands identically to ActionScript version

TASK: Implement facial feature controllers
- Port AvatarEye, AvatarMouth, AvatarNeck functionality
- Maintain bone transformation mathematics from original implementation  
- Implement lookAt() functionality for eye and neck movement
- Validate: Facial animations match reference system behavior

TASK: Create expression system
- Port AvatarExpression and ExpressionsCollection classes
- Implement expression blending and interpolation
- Support emotion and viseme combination as in original system
- Validate: Expression transitions are smooth and mathematically equivalent
```

## Acceptance Criteria

### System-Level Validation
- **Input**: Audio file used in original ActionScript system
- **Expected Output**: Identical viseme sequence and timing
- **Verification Method**: Frame-by-frame comparison of avatar animation

### Performance Benchmarks
- **Neural Network**: Classification speed within 10% of ActionScript performance
- **Audio Processing**: Real-time capability with <50ms latency for 30ms windows  
- **3D Rendering**: Maintain 30fps with complex facial animations

### Compatibility Requirements
- **Model Support**: Successfully load and animate existing avatar models
- **Network Support**: Import and use existing trained neural networks
- **Audio Support**: Process same audio formats as ActionScript version

---

*This specification defines the exact requirements for AI-driven migration. Each task is independently executable with clear validation criteria.*