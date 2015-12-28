# LipSync

This application generates real-time facial animations for 3D models based on input sound files.


## How it works
The application works in several steps:

1. Load speech samples in windows up to 30 ms
2. Extract features from the sample windows using linear prediction
3. Classify extracted feature blocks to visemes using neural networks
4. Animate the 3D model using viseme data


## Further reading

https://en.wikipedia.org/wiki/Linear_prediction

https://en.wikipedia.org/wiki/Viseme
