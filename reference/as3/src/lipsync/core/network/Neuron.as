package lipsync.core.network
{
	public class Neuron
	{
		internal var value:Number;
		internal var bias:Number;
		internal var momentum:Number;
		
		internal var size:int;
		internal var inputs:Vector.<Number>;
		internal var weights:Vector.<Number>;
		internal var momentums:Vector.<Number>;
		
		internal function createNeuron(inputsCount:int, bias:Number, weightRange:Number = 1):void {
			this.size = inputsCount;
			this.bias = bias;
			this.momentum = 0;
			
			this.inputs = new Vector.<Number>(size);
			this.weights = new Vector.<Number>(size);
			this.momentums = new Vector.<Number>(size);
			
			for (var i:int = 0; i < size; i++) {
				this.inputs[i] = NaN;
				this.weights[i] = (Math.random() * (weightRange + weightRange)) - weightRange;
				this.momentums[i] = 0;
			}
		}
		
		internal function adjustWeights(nError:Number, learningRate:Number, globalMomentum:Number, error:Array):void {
			var delta:Number = nError * this.value * (1 - this.value);
			
			for (var i:int = 0; i < size; i++) {
				var weightChange:Number = delta * inputs[i] * learningRate + momentums[i] * globalMomentum;
				momentums[i] = weightChange;
				weights[i] += weightChange;
				error[i] += delta * weights[i];
			}
			
			var biasChange:Number = delta * learningRate + this.momentum * globalMomentum;
			this.momentum = biasChange;
			this.bias += biasChange;
		}
		
		/*
		internal function adjustN(nError:Number, learningRate:Number, globalMomentum:Number, error:Array):void {
			var delta:Number = nError * this.value * (1 - this.value);
			
			for (var i:int = 0; i < size; i++) {
				var weightChange:Number = delta * inputs[i] * learningRate + momentums[i] * globalMomentum;
				error[i] += delta * weights[i];
			}
		}
		*/
		
		internal function calculateValue(inputsArray:Vector.<Number>):Number {
			var sum:Number = 0;
			
			for (var i:int = 0; i < size; i++) {
				inputs[i] = inputsArray[i];
				sum += weights[i] * inputs[i];
			}
			
			value = 1 / (1 + Math.exp( -1 * (sum + this.bias)));
			return value;
		}
		
	}
}