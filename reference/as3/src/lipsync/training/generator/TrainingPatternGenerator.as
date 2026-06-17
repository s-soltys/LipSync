package lipsync.training.generator
{
	import flash.events.Event;
	import flash.events.EventDispatcher;
	import flash.geom.Vector3D;
	import lipsync.core.phoneme.Phoneme;
	import lipsync.core.phoneme.PhonemeCollection;
	import lipsync.training.TrainingPattern;
	import lipsync.training.generator.SampleProvider;
	import lipsync.training.generator.ProviderEvent;
	/**
	 * ...
	 * @author S
	 */
	public class TrainingPatternGenerator extends EventDispatcher
	{
		private var soundTrainer:SampleProvider;
		private var samplingQueue:Array;
		private var filesDirectory:String;
		
		private var sampleOffset:Number = 0.2;
		
		private var patternArray:Vector.<TrainingPattern>;
		
		public function TrainingPatternGenerator(dir:String) {
			this.soundTrainer = new SampleProvider();
			this.filesDirectory = dir;
			samplingQueue = new Array();
			
			patternArray = new Vector.<TrainingPattern>();
			
			soundTrainer.addEventListener(ProviderEvent.TRAINING_SEQ, getTrainingSeq);
		}
		
		public function addSequence(fileName:String, phoneme:Phoneme, start:Number, stop:Number, count:Number = 30):void {
			samplingQueue.push(new Array(fileName, phoneme, generateArray(start * 1000, stop * 1000, count)));
		}
		
		public function getSamples():Vector.<TrainingPattern> {
			return patternArray;
		}
		
		public function start():void {
			readNext();
		}
		
		private function readNext():void {
			if (samplingQueue.length == 0) {
				var event:Event = new Event(Event.COMPLETE);
				dispatchEvent(event);
				return;
			}
			
			var list:Array = samplingQueue.pop();
			
			var soundFile:String = filesDirectory + list.shift();
			var phoneme:Phoneme = list.shift();
			
			soundTrainer.readTrainingSequence(soundFile, phoneme, list.shift());
		}
		
		
		private function getTrainingSeq(event:ProviderEvent):void {
			var sampleSet:Array = event.sampleArraySet;
			var phoneme:Phoneme = event.phoneme;
			
			for each(var samples:Vector.<Number> in sampleSet) {
				var pattern:TrainingPattern = new TrainingPattern();
				
				pattern.output = PhonemeCollection.phonemeToArray(phoneme);
				pattern.input = samples;
				
				patternArray.push(pattern);
			}
			
			readNext();
		}
		
		private function generateArray(start:int, stop:int, steps:int):Array {
			var array:Array = new Array();
			
			var dist:int = (stop - start) / steps;
			for (var i:int = start; i < stop; ) {
				array.push(i);
				i += (dist + sampleOffset * dist * (0.5 - Math.random()));
			}
			
			return array;
		}
		
	}

}