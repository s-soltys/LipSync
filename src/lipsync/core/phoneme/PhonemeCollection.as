package lipsync.core.phoneme 
{
	import lipsync.core.LipsyncSettings;
	/**
	 * ...
	 * @author S
	 */
	public class PhonemeCollection
	{
		public static var phonemes:Vector.<Phoneme> = new Vector.<Phoneme>();
		
		private static function initCollection():void {
			if (phonemes.length == 0) {
				phonemes.push(Phoneme.v1a);
				phonemes.push(Phoneme.v1b);
				phonemes.push(Phoneme.v2a);
				phonemes.push(Phoneme.v2b);
				phonemes.push(Phoneme.v3a);
				phonemes.push(Phoneme.v3b);
				phonemes.push(Phoneme.v4a);
				phonemes.push(Phoneme.v4b);
				phonemes.push(Phoneme.v5a);
				phonemes.push(Phoneme.v5b);
				phonemes.push(Phoneme.v6a);
				phonemes.push(Phoneme.v6b);
				phonemes.push(Phoneme.v7a);
				phonemes.push(Phoneme.v7b);
				phonemes.push(Phoneme.v8a);
				phonemes.push(Phoneme.v8b);
				phonemes.push(Phoneme.v9a);
				phonemes.push(Phoneme.v9b);
			}
		}
		
		public static function getById(id:int):Phoneme {
			initCollection();
			
			for each(var phoneme:Phoneme in phonemes) {
				if (phoneme.id == id)
					return phoneme;
			}
			
			return Phoneme.NULL;
		}
		
		public static function phonemeToArray(phoneme:Phoneme):Vector.<Number> {
			var id:int = phoneme.id;
			var digits:int = LipsyncSettings.outputCount;
			
			var result:Vector.<Number> = new Vector.<Number>();
			for (var i:Number = 0; i <= digits - 1; i++) result[i] = 0;
			for (i = digits - 1; i >= 0; i--) {
				if ((id - Math.pow(2, i)) >= 0) {
					result[digits - 1 - i] = 1;
					id -= Math.pow(2,i);
					}
			}
			return result;
		}
		
		public static function arrayToPhoneme(array:Vector.<Number>):Phoneme {
			if (isNaN(array[0])) return Phoneme.NULL;
			
			var result:int = 0;
			var mult:int = 1;
			for (var i:int = array.length - 1; i >= 0; i--) {
				var value:Number = array[i];
				
				if (array[i] >= 0.5) {
					result += mult;
				}
				mult *= 2;
			}
			return PhonemeCollection.getById(result);
		}
		
	}
}