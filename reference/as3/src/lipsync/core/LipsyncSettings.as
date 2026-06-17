package lipsync.core 
{
	/**
	 * ...
	 * @author S
	 */
	public class LipsyncSettings {
		public static var outputCount:int = 6;
		
		public static var samplingDecimate:int = 6;
		
		public static const samplingRate:int = 44100;
		public static const samplingRateMS:Number = 44.1;
		
		public static var windowLength:int = 18;
		
		public static var recognizePhonemeDelay:int = 20;
		
		public static var activationEnergy:Number = 0.025;
	}

}