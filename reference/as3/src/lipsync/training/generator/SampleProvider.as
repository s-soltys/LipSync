package lipsync.training.generator {
	import flash.events.Event;
	import flash.events.EventDispatcher;
	import flash.media.Sound;
	import flash.net.URLRequest;
	import flash.utils.ByteArray;
	import lipsync.core.LipsyncSettings;
	import lipsync.core.lpc.LP;
	import lipsync.core.phoneme.Phoneme;
	import lipsync.training.generator.ProviderEvent;
	/**
	 * ...
	 * @author S
	 */
	public class SampleProvider extends EventDispatcher
	{
		private var sound:Sound;
		
		private var phoneme:Phoneme;
		private var phonemeList:Array;
		
		
		internal function readTrainingSequence(fileName:String, phoneme:Phoneme, phonemeList:Array):void {
			this.phoneme = phoneme;
			this.phonemeList = phonemeList;
			
			sound = new Sound();
			sound.load(new URLRequest(fileName));
			sound.addEventListener(Event.COMPLETE, fileLoaded);
		}
		
		private function fileLoaded(e:Event):void {
			var sampleArraySet:Array = new Array();
			
			for each(var samplePos:int in phonemeList) {
				sampleArraySet.push(getPhonemes(samplePos));
			}
			
			var event:ProviderEvent = new ProviderEvent(ProviderEvent.TRAINING_SEQ);
			event.sampleArraySet = sampleArraySet;
			event.phoneme = phoneme;
			
			dispatchEvent(event);
		}
		
		internal function getPhonemes(position:int):Vector.<Number> {
			var samples:Vector.<Number> = extractSound(position);
			var lpcParam:Vector.<Number> = LP.analyze(samples);
			
			var output:Vector.<Number> = new Vector.<Number>();
			
			for each(var param:Number in lpcParam) {
				output.push(param);
			}
			
			return output;
		}
		
		private function extractSound(position:int):Vector.<Number> {
			var buffer:ByteArray = new ByteArray();
			
			sound.extract(buffer, LipsyncSettings.windowLength * LipsyncSettings.samplingRateMS, position);
			
			buffer.position = 0;
			var array:Vector.<Number> = new Vector.<Number>();
			
			var offset:int = 4 * (LipsyncSettings.samplingDecimate + 1);
			while (buffer.bytesAvailable > 0) {
				array.push(buffer.readFloat());
				buffer.position += offset;
			}
			
			return array;
		}
		
	}

}