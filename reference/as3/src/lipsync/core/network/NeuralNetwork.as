package lipsync.core.network
{
	import flash.utils.ByteArray;
	import lipsync.core.LipsyncSettings;
	import lipsync.core.lpc.LP;
	import lipsync.training.TrainingPattern;
	
	public class NeuralNetwork
	{
		private var layers:Array;
		
		private var momentum:Number = 0.5;
		private var neuronalBias:Number = 1;
		private var initialWeightRange:Number = 1;
		private var realLearningRate:Number = NaN;
		private var hiddenLayers:int = 2;
		
		
		public function createNetwork(inputs:int, outputs:int, neuronsPerLayer:int):void {
			this.layers = [];
			
			this.layers[0] = createLayer(neuronsPerLayer, inputs, neuronalBias, initialWeightRange);
			for (var i:int = 1; i < hiddenLayers; i++) {
				this.layers[i] = createLayer(neuronsPerLayer, inputs, neuronalBias, initialWeightRange);
			}
			this.layers[hiddenLayers] = createLayer(outputs, neuronsPerLayer, neuronalBias, initialWeightRange);
		}
		
		private function createLayer(neurons:int, inputs:int, bias:Number, weightRange:Number):Vector.<Neuron> {
			var newLayer:Vector.<Neuron> = new Vector.<Neuron>();
			for (var i:int = 0; i < neurons; i++) {
				var neuron:Neuron = new Neuron();
				neuron.createNeuron(inputs, bias, weightRange);
				
				newLayer.push(neuron);
			}
			return newLayer;
		}
		
		
		public function run(inputArray:Vector.<Number>):Vector.<Number> {
			var layerOutputs:Array = new Array(layers.length + 1);
			for (var l:int = 0; l <= layers.length; l++) {
				layerOutputs[l] = new Vector.<Number>();
			}
			
			var inputs:Vector.<Number> = inputArray;
			for (l = 0; l < layers.length; l++) {
				var output:Vector.<Number> = layerOutputs[l + 1];
				
				for each (var neuron:Neuron in layers[l]) {
					output.push(neuron.calculateValue(inputs));
				}
				
				inputs = output;
			}
			
			return layerOutputs[layerOutputs.length - 1];
		}
		
		public function train(patterns:Vector.<TrainingPattern>, epochs:int, learningRate:Number, targetMSE:Number = 0.02):Number {
			if (isNaN(realLearningRate)) {
				realLearningRate = learningRate;
			}
			
			var MSE:Number = 0;
			for (var r:int = 0; r < epochs; r++) {
				patterns = shufflePatterns(patterns);
				
				MSE = 0;
				for (var i:int = 0; i < patterns.length; i++) {
					var input:Vector.<Number> = (patterns[i] as TrainingPattern).input;
					var output:Vector.<Number> = (patterns[i] as TrainingPattern).output;
					
					this.run(input); 
					MSE += this.adjust(output, realLearningRate);
				}
				
				MSE = MSE / patterns.length;
				realLearningRate = learningRate * MSE;
				
				if (MSE <= targetMSE) {
					break;
				}
			}
			
			return MSE;
		}
		
		private function adjust(outputArray:Vector.<Number>, learningRate:Number):Number {
			var MSEsum:Number = 0;
			var layerCount:int = this.layers.length - 1;
			var error:Array = [];
			
			for (var l:int = layerCount; l >= 0; --l) {
				var layer:Vector.<Neuron> = layers[l];
				
				error[l] = [];
				for (var i:int = 0; i < layer[0].size; i++) {
					error[l].push(0);
				}
				
				var nError:Number = 0;
				for (var n:int = 0; n < layer.length; n++) {
					var neuron:Neuron = layer[n];
					
					if (l == layerCount) {
						nError = outputArray[n] - neuron.value;
						MSEsum += nError * nError;
					} else {
						nError = error[l + 1][n];
					}
					trace(nError);
					neuron.adjustWeights(nError, learningRate, momentum, error[l]);
				}
			}
			trace("MSESum " + MSEsum);
			return MSEsum / (layers[layerCount].length);
		}
		
		
		public static function shufflePatterns(array_arr:Vector.<TrainingPattern>):Vector.<TrainingPattern> {
			for(var i:Number = 0; i < array_arr.length; i++){
			  var randomNum_num:int = Math.floor(Math.random() * array_arr.length)
			  var arrayIndex:TrainingPattern = array_arr[i];
			  array_arr[i] = array_arr[randomNum_num];
			  array_arr[randomNum_num] = arrayIndex;
		   }
		   return array_arr;
		}
		
		public function save():ByteArray {
			var output:ByteArray = new ByteArray();
			
			output.writeInt(LP.order);
			output.writeInt(LipsyncSettings.outputCount);
			output.writeInt(LipsyncSettings.samplingDecimate);
			output.writeInt(LipsyncSettings.windowLength);
			
			output.writeDouble(momentum);
			output.writeDouble(realLearningRate);
			output.writeInt(layers.length);
			
			for (var l:int = 0; l < layers.length; l++) {
				var layer:Vector.<Neuron> = layers[l];
				
				output.writeInt(layer.length);
				for (var n:int = 0; n < layer.length; n++) {
					var neuron:Neuron = layer[n];
					
					output.writeDouble(neuron.value);
					output.writeDouble(neuron.bias);
					output.writeDouble(neuron.momentum);
					
					output.writeInt(neuron.size);
					for (var s:int = 0; s < neuron.size; s++) {
						output.writeDouble(neuron.inputs[s]);
						output.writeDouble(neuron.weights[s]);
						output.writeDouble(neuron.momentums[s]);
					}
				}
			}
			
			output.compress();
			output.position = 0;
			
			return output;
		}
		
		public function load(input:ByteArray):void {
			input.uncompress();
			input.position = 0;
			
			LP.order = input.readInt();
			LipsyncSettings.outputCount = input.readInt();
			LipsyncSettings.samplingDecimate = input.readInt();
			LipsyncSettings.windowLength = input.readInt();
			
			this.momentum = input.readDouble();
			this.realLearningRate = input.readDouble();
			
			var layersLength:int = input.readInt();
			layers = new Array(layersLength);
			
			for (var l:int = 0; l < layersLength; l++) {
				var layerLength:int = input.readInt();
				var layer:Vector.<Neuron> = new Vector.<Neuron>();
				
				for (var n:int = 0; n < layerLength; n++) {
					var neuron:Neuron = new Neuron();
					
					neuron.value = input.readDouble();
					neuron.bias = input.readDouble();
					neuron.momentum = input.readDouble();
					
					neuron.size = input.readInt();
					neuron.inputs = new Vector.<Number>(neuron.size);
					neuron.weights = new Vector.<Number>(neuron.size);
					neuron.momentums = new Vector.<Number>(neuron.size);
					
					for (var s:int = 0; s < neuron.size; s++) {
						neuron.inputs[s] = input.readDouble();
						neuron.weights[s] = input.readDouble();
						neuron.momentums[s] = input.readDouble();
					}
					
					layer[n] = neuron;
					
					
				}
				
				layers[l] = layer;
			}
			
		}
		
	}
}